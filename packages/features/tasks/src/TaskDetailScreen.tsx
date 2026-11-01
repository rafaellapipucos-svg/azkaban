import { taskRules } from '@azkaban/config';
import type { TaskEditScope } from '@azkaban/contracts';
import {
  buildTaskInput,
  forgivesOverdue,
  fromRRule,
  isOverdue,
  planDelete,
  taskFormValues,
  type TaskFormValues,
} from '@azkaban/core';
import {
  contextsRepository,
  groupsRepository,
  taskErrorCode,
  tasksRepository,
  useCurrentUser,
} from '@azkaban/data';
import { useTranslation } from '@azkaban/i18n';
import {
  Body,
  Button,
  Card,
  ConfirmButton,
  DateField,
  EmptyState,
  ErrorText,
  Muted,
  Screen,
  StatusBadge,
  Subtitle,
  TimeField,
  Title,
  tokens,
} from '@azkaban/ui';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { useForm } from 'react-hook-form';
import { View } from 'react-native';
import { z } from 'zod';
import { capitalize, describeRecurrence, errorKey, whenText } from './format';
import {
  useNow,
  useRefreshTasks,
  useStatusChange,
  useTransitions,
  type OccurrenceDetail,
} from './hooks';
import { StatusActions } from './StatusActions';

const SCOPES: TaskEditScope[] = ['this', 'this_and_following', 'all'];

/** "Só esta", "Esta e as próximas" or "Todas": asked before editing or deleting a repeating task. */
function ScopePrompt({
  mode,
  onPick,
  onCancel,
}: {
  mode: 'edit' | 'delete';
  onPick: (scope: TaskEditScope) => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation('tasks');
  return (
    <Card>
      <Subtitle>{t(`scope.${mode}Title`)}</Subtitle>
      {SCOPES.map((scope) =>
        // Deleting all of them is the one change with no way back, so it asks twice.
        mode === 'delete' && scope === 'all' ? (
          <ConfirmButton
            key={scope}
            label={t(`scope.${scope}`)}
            confirmLabel={t('scope.allConfirm')}
            onConfirm={() => onPick(scope)}
          />
        ) : (
          <Button
            key={scope}
            variant="secondary"
            label={t(`scope.${scope}`)}
            onPress={() => onPick(scope)}
          />
        ),
      )}
      <Button variant="secondary" label={t('actions.cancel')} onPress={onCancel} />
    </Card>
  );
}

const rescheduleSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  time: z.string(),
});
type RescheduleValues = z.infer<typeof rescheduleSchema>;
const TIME = /^\d{2}:\d{2}$/;

/** Reschedule is an edit of this one occurrence (ADR-0005 section 8): same task, new day and time. */
function ReschedulePanel({ detail, onDone }: { detail: OccurrenceDetail; onDone: () => void }) {
  const { t } = useTranslation('tasks');
  const refresh = useRefreshTasks();
  const { user } = useCurrentUser();
  const now = useNow();
  const { item, task } = detail;
  // Moving an overdue occurrence does not clear the delay (ADR-0005 section 11), unless someone who
  // answers for neither the old nor the new assignee grants a new deadline.
  const staysOverdue =
    isOverdue(item, now) &&
    !forgivesOverdue(user, {
      groupId: task.groupId,
      visibility: task.visibility,
      occurrenceAssigneeId: item.assigneeId,
      newAssigneeId: task.assigneeId,
    });
  const timed = task.scheduleType === 'timed';
  const deadline = task.scheduleType === 'deadline';
  const current = taskFormValues(task, item, 'this');
  const { control, handleSubmit } = useForm<RescheduleValues>({
    resolver: zodResolver(
      rescheduleSchema.refine((values) => !timed || TIME.test(values.time), { path: ['time'] }),
    ),
    defaultValues: { date: current.date, time: current.time },
  });
  const save = useMutation({
    mutationFn: async (values: RescheduleValues) => {
      const form: TaskFormValues = {
        ...current,
        date: values.date,
        time: timed ? values.time : current.time,
        // A deadline that moves must not start after it falls due.
        startDate: deadline && current.startDate > values.date ? '' : current.startDate,
      };
      const input = buildTaskInput(form, {
        timezone: task.timezone,
        assigneeId: task.assigneeId,
        creatorId: task.createdBy ?? user.id,
        personalContext: task.groupId === null,
      });
      await tasksRepository.edit(
        { occurrenceId: item.id, scope: 'this', task: input },
        { rrule: null, headRrule: null },
      );
    },
    onSuccess: async () => {
      await refresh();
      onDone();
    },
  });

  return (
    <Card>
      <Subtitle>{t('detail.reschedule')}</Subtitle>
      {task.rrule ? <Muted>{t('detail.rescheduleRepeats')}</Muted> : null}
      {staysOverdue ? <Body role="note">{t('detail.overdueNotice')}</Body> : null}
      <DateField
        control={control}
        name="date"
        label={t(deadline ? 'form.dueDate' : 'form.date')}
        errorText={t('form.dateRequired')}
      />
      {timed ? (
        <TimeField
          control={control}
          name="time"
          label={t('form.time')}
          errorText={t('form.timeRequired')}
        />
      ) : null}
      {save.isError ? <ErrorText>{t(errorKey(taskErrorCode(save.error)))}</ErrorText> : null}
      <Button
        label={t('detail.rescheduleSave')}
        loading={save.isPending}
        onPress={handleSubmit((values) => save.mutate(values))}
      />
      <Button variant="secondary" label={t('actions.cancel')} onPress={onDone} />
    </Card>
  );
}

/** Task detail: what it is, what can be done to it now, and what happened before. */
export function TaskDetailScreen({
  occurrenceId,
  children,
}: {
  occurrenceId: string;
  /**
   * The photo flow's entry (a button of `prova-foto`), composed by the route as in ADR-0006. It is
   * drawn where "Marcar como feito" would be, and only while the user can send the photo.
   */
  children?: ReactNode;
}) {
  const { t, i18n } = useTranslation('tasks');
  const router = useRouter();
  const refresh = useRefreshTasks();
  const now = useNow();
  const { user, timezone } = useCurrentUser();
  const status = useStatusChange();
  const [panel, setPanel] = useState<'edit' | 'delete' | 'reschedule' | null>(null);

  const detail = useQuery({
    queryKey: ['occurrence', occurrenceId],
    queryFn: () => tasksRepository.getOccurrence(occurrenceId),
  });
  const history = useQuery({
    queryKey: ['history', occurrenceId],
    queryFn: () => tasksRepository.listHistory(occurrenceId),
  });
  const contexts = useQuery({ queryKey: ['contexts'], queryFn: contextsRepository.list });
  const groupId = detail.data?.task.groupId ?? null;
  const members = useQuery({
    queryKey: ['group-members', groupId],
    queryFn: () => groupsRepository.listMembers(groupId ?? ''),
    enabled: groupId !== null,
  });
  const { actors, available, canEdit, canDelete, canSendProof, windowOpen } = useTransitions(
    detail.data?.item,
  );

  const goBack = () => (router.canGoBack() ? router.back() : router.replace('/'));
  const remove = useMutation({
    mutationFn: async (scope: TaskEditScope) => {
      if (!detail.data) return;
      const { item, task } = detail.data;
      const headRrule = planDelete({ scope, task, pivotStart: item.scheduledStart });
      await tasksRepository.remove({ occurrenceId, scope }, headRrule);
    },
    onSuccess: async () => {
      await refresh();
      goBack();
    },
  });

  if (detail.isPending) {
    return (
      <Screen>
        <Muted>{t('loading')}</Muted>
      </Screen>
    );
  }
  if (!detail.data) {
    return (
      <Screen>
        <EmptyState text={t('detail.notFound')} />
        <Button variant="secondary" label={t('actions.back')} onPress={goBack} />
      </Screen>
    );
  }

  const { item, task } = detail.data;
  const repeats = task.rrule !== null;
  const context = contexts.data?.find(({ id }) => id === task.contextId);
  const nameOf = (id: string | null) => {
    if (id === null) return t('detail.system');
    if (id === user.id) return t('detail.you');
    return members.data?.find(({ userId }) => userId === id)?.displayName ?? t('detail.someone');
  };
  let recurrenceText: string | null = null;
  if (task.rrule) {
    try {
      recurrenceText = describeRecurrence(fromRRule(task.rrule, task.timezone), t);
    } catch {
      recurrenceText = t('detail.customRepeat');
    }
  }
  const moment = new Intl.DateTimeFormat(i18n.language, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: timezone,
  }).format(Date.parse(item.scheduledStart));
  const clock = whenText(item, { t, timezone, now, language: i18n.language });
  const changeFormat = new Intl.DateTimeFormat(i18n.language, {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: timezone,
  });

  const edit = (scope: TaskEditScope) => {
    setPanel(null);
    router.push(`/tasks/${occurrenceId}/edit?scope=${scope}`);
  };
  // Pending, past the late window and without a way to "feito": say why, instead of only "Não fiz".
  const windowClosed =
    item.status === 'pending' && !windowOpen && !available.some(({ to }) => to === 'done');
  const reviewing = item.proofReviewStatus === 'in_review';
  const disputed = item.proofReviewStatus === 'disputed';
  // A photo is the only road to green, and it is still open to someone.
  const awaitsPhoto =
    task.requiresPhotoProof && !disputed && (item.status === 'pending' || item.status === 'missed');
  const failed =
    status.error ?? (remove.isError ? (taskErrorCode(remove.error) ?? 'generic') : null);

  return (
    <Screen>
      <View style={{ gap: tokens.spacing[2] }} className="items-start">
        <Title>{task.title}</Title>
        <StatusBadge status={item.status} reviewing={reviewing} />
        {item.late && item.status === 'done' ? <Muted>{t('detail.doneLate')}</Muted> : null}
        {reviewing ? <Muted>{t('detail.inReview')}</Muted> : null}
        {disputed ? (
          <View style={{ gap: tokens.spacing[1] }}>
            <Body className="font-heavy">
              <Body aria-hidden>⚠ </Body>
              {t('detail.disputed')}
            </Body>
            {item.statusReason ? (
              <Body>{t('detail.disputedReason', { reason: item.statusReason })}</Body>
            ) : null}
          </View>
        ) : null}
      </View>

      <Card>
        {context ? (
          <Body>
            <Body aria-hidden>{context.icon} </Body>
            {context.name}
          </Body>
        ) : null}
        <Body>
          {capitalize(moment)} · {clock}
        </Body>
        {recurrenceText ? <Muted>{t('detail.repeats', { text: recurrenceText })}</Muted> : null}
        <Muted>{t('detail.assignee', { name: nameOf(item.assigneeId) })}</Muted>
        {task.notes ? <Body>{task.notes}</Body> : null}
      </Card>

      {failed ? (
        <ErrorText>
          {t(errorKey(failed))}
          {/* A personal task has no administrator to ask. */}
          {failed === 'late_window_expired' && task.groupId !== null
            ? ` ${t('errors.late_window_expired_group')}`
            : ''}
        </ErrorText>
      ) : null}
      <Subtitle>{t('detail.statusTitle')}</Subtitle>
      {windowClosed ? (
        <Muted>
          {t('detail.windowClosed', { hours: taskRules.lateCompletionWindowHours })}
          {task.groupId !== null ? ` ${t('detail.windowClosedGroup')}` : ''}
        </Muted>
      ) : null}
      {awaitsPhoto ? (
        <View style={{ gap: tokens.spacing[2] }}>
          <Body>
            <Body aria-hidden>📷 </Body>
            {t('detail.proofRequired')}
          </Body>
          {canSendProof ? children : null}
          {/* Past the late window the message above says why; this one is for who is not the assignee. */}
          {!actors.includes('assignee') ? <Muted>{t('detail.proofOnlyAssignee')}</Muted> : null}
        </View>
      ) : null}
      {disputed && available.length === 0 ? <Muted>{t('detail.disputedLocked')}</Muted> : null}
      {/* A dispute with nothing to offer already said why above. */}
      {disputed && available.length === 0 ? null : (
        <StatusActions
          item={item}
          available={available}
          onChange={(to, reason) => status.change(item, to, reason)}
        />
      )}

      {panel === 'edit' ? (
        <ScopePrompt mode="edit" onPick={edit} onCancel={() => setPanel(null)} />
      ) : null}
      {panel === 'delete' ? (
        <ScopePrompt
          mode="delete"
          onPick={(scope) => {
            setPanel(null);
            remove.mutate(scope);
          }}
          onCancel={() => setPanel(null)}
        />
      ) : null}
      {panel === 'reschedule' ? (
        <ReschedulePanel detail={detail.data} onDone={() => setPanel(null)} />
      ) : null}

      {panel === null ? (
        <View style={{ gap: tokens.spacing[2] }}>
          {canEdit ? (
            <Button
              variant="secondary"
              label={t('detail.edit')}
              onPress={() => (repeats ? setPanel('edit') : edit('all'))}
            />
          ) : null}
          {canEdit && item.status === 'pending' ? (
            <Button
              variant="secondary"
              label={t('detail.reschedule')}
              onPress={() => setPanel('reschedule')}
            />
          ) : null}
          <Button
            variant="secondary"
            label={t('detail.duplicate')}
            onPress={() => router.push(`/tasks/new?from=${occurrenceId}`)}
          />
          {canDelete ? (
            repeats ? (
              <Button
                variant="secondary"
                label={t('detail.delete')}
                onPress={() => setPanel('delete')}
              />
            ) : (
              <ConfirmButton
                label={t('detail.delete')}
                confirmLabel={t('detail.deleteConfirm')}
                loading={remove.isPending}
                onConfirm={() => remove.mutate('all')}
              />
            )
          ) : null}
        </View>
      ) : null}

      <Subtitle>{t('history.title')}</Subtitle>
      {history.data && history.data.length === 0 ? <Muted>{t('history.empty')}</Muted> : null}
      {history.data?.map((entry) => (
        <Card key={entry.id}>
          {/* An approval changes no status: its entry has the same status on both sides. */}
          {entry.fromStatus === entry.toStatus && entry.proofReviewStatus === 'approved' ? (
            <Body>{t('history.proofApproved')}</Body>
          ) : (
            <Body>
              {t('history.entry', {
                from: t(`status.${entry.fromStatus}`),
                to: t(`status.${entry.toStatus}`),
              })}
              {entry.proofReviewStatus === 'in_review' ? ` (${t('history.inReview')})` : ''}
              {entry.proofReviewStatus === 'disputed' ? ` · ${t('history.proofDisputed')}` : ''}
              {entry.proofReviewStatus === 'approved' ? ` · ${t('history.proofApproved')}` : ''}
            </Body>
          )}
          <Muted className="text-sm">
            {t('history.by', {
              name: nameOf(entry.changedBy),
              when: changeFormat.format(Date.parse(entry.changedAt)),
            })}
          </Muted>
          {entry.reason ? <Body>{t('history.reason', { reason: entry.reason })}</Body> : null}
        </Card>
      ))}
    </Screen>
  );
}
