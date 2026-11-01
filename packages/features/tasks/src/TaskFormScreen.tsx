import { taskEditScopeSchema, type GroupMember } from '@azkaban/contracts';
import {
  addDays,
  buildTaskInput,
  can,
  localDayRange,
  nextHourTime,
  planEdit,
  rruleOf,
  taskFormValues,
  toBatchInput,
  type TaskFormValues,
} from '@azkaban/core';
import {
  contextsRepository,
  groupsRepository,
  taskErrorCode,
  tasksRepository,
} from '@azkaban/data';
import { useTranslation } from '@azkaban/i18n';
import {
  Body,
  Button,
  Chip,
  ChipRow,
  DateField,
  EmptyState,
  ErrorText,
  FormTextField,
  Muted,
  Screen,
  SegmentedControl,
  Stepper,
  SwitchRow,
  TimeField,
  Title,
  tokens,
} from '@azkaban/ui';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { useController, useForm, useWatch, type Control, type FieldPath } from 'react-hook-form';
import { View } from 'react-native';
import { AssigneePicker } from './AssigneePicker';
import { tasksConfig } from './config';
import { errorKey, formErrorKey, reminderLabel } from './format';
import { defaultFormValues } from './formDefaults';
import { useCurrentUser, useLastContext, useRefreshTasks, useTransitions } from './hooks';
import { RecurrenceEditor } from './RecurrenceEditor';
import { taskFormSchema } from './taskFormSchema';
import { taskDefaults } from '@azkaban/config';

type Props = {
  /** Editing: the occurrence, and the scope chosen in the prompt before this screen. */
  occurrenceId?: string;
  /** Comes from the route, so it is checked here. */
  scope?: string;
  /** Creating a copy of another occurrence's task. */
  duplicateOf?: string;
  /** From quick create's "Mais opções". */
  prefill?: { title?: string; contextId?: string; day?: string; time?: string };
};

function FormSwitch({
  control,
  name,
  label,
  description,
}: {
  control: Control<TaskFormValues>;
  name: FieldPath<TaskFormValues> & ('hasDuration' | 'repeat' | 'requiresPartialReason');
  label: string;
  description?: string;
}) {
  const { field } = useController({ control, name });
  return (
    <SwitchRow
      label={label}
      description={description}
      value={field.value === true}
      onValueChange={field.onChange}
    />
  );
}

function Choice<T extends string>({
  control,
  name,
  label,
  options,
}: {
  control: Control<TaskFormValues>;
  name: 'difficulty' | 'priority';
  label: string;
  options: { value: T; label: string }[];
}) {
  const { field } = useController({ control, name });
  return (
    <View className="gap-2">
      <Body>{label}</Body>
      <ChipRow label={label}>
        {options.map((option) => (
          <Chip
            key={option.value}
            label={option.label}
            selected={field.value === option.value}
            onPress={() => field.onChange(option.value)}
          />
        ))}
      </ChipRow>
    </View>
  );
}

/** Creates and edits tasks: every field of section 7.3 that Phase 2 keeps. */
export function TaskFormScreen({ occurrenceId, scope: scopeParam, duplicateOf, prefill }: Props) {
  const scope = taskEditScopeSchema.catch('all').parse(scopeParam);
  const { t } = useTranslation('tasks');
  const router = useRouter();
  const refresh = useRefreshTasks();
  const { user, groups, timezone: profileTimezone, ready } = useCurrentUser();
  const { lastContextId, remember } = useLastContext();
  const contexts = useQuery({ queryKey: ['contexts'], queryFn: contextsRepository.list });
  const [opened] = useState(() => new Date());
  const [more, setMore] = useState(false);

  const editing = occurrenceId !== undefined;
  const sourceId = occurrenceId ?? duplicateOf;
  const source = useQuery({
    queryKey: ['occurrence', sourceId],
    queryFn: () => tasksRepository.getOccurrence(sourceId ?? ''),
    enabled: sourceId !== undefined,
  });
  const existing = source.data ?? null;
  const { canEdit } = useTransitions(existing?.item);
  const timezone = editing && existing ? existing.task.timezone : profileTimezone;
  const list = contexts.data ?? [];

  const initial = useMemo<TaskFormValues | null>(() => {
    if (!ready || !contexts.isSuccess) return null;
    if (existing) {
      const values = taskFormValues(existing.task, existing.item, editing ? scope : 'this');
      return editing ? values : { ...values, assigneeIds: [user.id], visibility: 'group' };
    }
    if (sourceId !== undefined) return null;
    const today = localDayRange(profileTimezone, opened).date;
    const contextId =
      [prefill?.contextId, lastContextId].find((id) => list.some((context) => context.id === id)) ??
      list[0]?.id ??
      '';
    return {
      ...defaultFormValues({
        contextId,
        userId: user.id,
        date: prefill?.day === 'tomorrow' ? addDays(today, 1) : today,
        time: prefill?.time ?? nextHourTime(profileTimezone, opened),
      }),
      title: prefill?.title ?? '',
    };
  }, [
    ready,
    contexts.isSuccess,
    existing,
    editing,
    scope,
    sourceId,
    user.id,
    profileTimezone,
    opened,
    prefill?.contextId,
    prefill?.day,
    prefill?.time,
    prefill?.title,
    lastContextId,
    list,
  ]);

  const { control, handleSubmit, setValue } = useForm<TaskFormValues>({
    resolver: zodResolver(taskFormSchema),
    defaultValues: defaultFormValues({ contextId: '', userId: '', date: '', time: '' }),
    values: initial ?? undefined,
    resetOptions: { keepDirtyValues: true },
  });
  const contextId = useWatch({ control, name: 'contextId' });
  const scheduleType = useWatch({ control, name: 'scheduleType' });
  const repeat = useWatch({ control, name: 'repeat' });
  const date = useWatch({ control, name: 'date' });
  const hasDuration = useWatch({ control, name: 'hasDuration' });
  const durationMin = useWatch({ control, name: 'durationMin' });
  const assigneeIds = useWatch({ control, name: 'assigneeIds' });
  const reminders = useWatch({ control, name: 'reminders' });
  const visibility = useWatch({ control, name: 'visibility' });

  const context = list.find(({ id }) => id === contextId);
  const group = groups.find(({ id }) => id === context?.groupId);
  const canAssign = group ? can(user, 'task.create_for_others', group) : false;
  const members = useQuery({
    queryKey: ['group-members', group?.id],
    queryFn: () => groupsRepository.listMembers(group?.id ?? ''),
    enabled: canAssign,
  });
  const creatorId = editing ? (existing?.task.createdBy ?? user.id) : user.id;
  const keepsPrivate =
    group !== undefined &&
    assigneeIds.length === 1 &&
    assigneeIds[0] === user.id &&
    creatorId === user.id;
  // A task can only move to another context of the same owner (ADR-0005 section 2).
  const currentOwner = existing ? list.find(({ id }) => id === existing.task.contextId) : undefined;
  const selectable =
    editing && currentOwner ? list.filter(({ groupId }) => groupId === currentOwner.groupId) : list;
  const reminderOptions = [...new Set([...tasksConfig.reminderOptions, ...reminders])].sort(
    (a, b) => a - b,
  );

  const goBack = () => (router.canGoBack() ? router.back() : router.replace('/'));
  const save = useMutation({
    mutationFn: async (values: TaskFormValues) => {
      const input = buildTaskInput(values, {
        timezone,
        assigneeId: values.assigneeIds[0] ?? user.id,
        creatorId,
        personalContext: context?.groupId === null,
      });
      if (editing && existing && occurrenceId) {
        const plan = planEdit({
          scope,
          task: existing.task,
          pivotStart: existing.item.scheduledStart,
          input,
        });
        await tasksRepository.edit({ occurrenceId, scope, task: input }, plan);
      } else if (values.assigneeIds.length > 1) {
        await tasksRepository.createBatch(toBatchInput(input, values.assigneeIds), rruleOf(input));
      } else {
        await tasksRepository.create(input, rruleOf(input));
      }
      remember(values.contextId);
    },
    onSuccess: async () => {
      await refresh();
      goBack();
    },
  });

  if (editing && existing && !canEdit) {
    return (
      <Screen>
        <EmptyState text={t('form.cannotEdit')} />
        <Button variant="secondary" label={t('actions.back')} onPress={goBack} />
      </Screen>
    );
  }
  if (!initial) {
    return (
      <Screen>
        <Muted>{t('loading')}</Muted>
      </Screen>
    );
  }
  if (list.length === 0) {
    return (
      <Screen>
        <EmptyState text={t('today.noContext')}>
          <Button label={t('today.newContext')} onPress={() => router.replace('/contexts/new')} />
        </EmptyState>
      </Screen>
    );
  }

  const changeContext = (id: string) => {
    setValue('contextId', id, { shouldDirty: true });
    // Another context can belong to another group, where the old assignees may not be members.
    if (list.find((item) => item.id === id)?.groupId !== context?.groupId) {
      setValue('assigneeIds', [user.id], { shouldDirty: true });
      setValue('visibility', 'group', { shouldDirty: true });
    }
  };
  const changeType = (type: TaskFormValues['scheduleType']) => {
    setValue('scheduleType', type, { shouldDirty: true });
    setValue('reminders', [...taskDefaults.reminderLeadMinutes[type]], { shouldDirty: true });
  };
  const toggleReminder = (minutes: number) => {
    const next = reminders.includes(minutes)
      ? reminders.filter((value) => value !== minutes)
      : [...reminders, minutes];
    if (next.length <= 5) setValue('reminders', next, { shouldDirty: true });
  };
  const failure = save.error
    ? t(formErrorKey(save.error) ?? errorKey(taskErrorCode(save.error)))
    : null;
  const title = editing ? t('form.editTitle') : t('form.newTitle');

  return (
    <Screen>
      <Title>{title}</Title>
      {editing ? <Muted>{t(`form.scope.${scope}`)}</Muted> : null}

      <FormTextField
        control={control}
        name="title"
        label={t('form.titleLabel')}
        errorText={t('form.titleRequired')}
        maxLength={120}
      />

      {selectable.length > 1 ? (
        <View className="gap-2">
          <Body>{t('form.context')}</Body>
          <ChipRow label={t('form.context')}>
            {selectable.map((item) => (
              <Chip
                key={item.id}
                label={`${item.icon} ${item.name}`}
                colorToken={item.colorToken}
                selected={contextId === item.id}
                onPress={() => changeContext(item.id)}
              />
            ))}
          </ChipRow>
        </View>
      ) : null}

      <SegmentedControl
        label={t('form.whenLabel')}
        value={scheduleType}
        onChange={changeType}
        options={[
          { value: 'timed', label: t('form.type.timed') },
          { value: 'all_day', label: t('form.type.all_day') },
          { value: 'deadline', label: t('form.type.deadline') },
        ]}
      />
      <DateField
        control={control}
        name="date"
        label={t(scheduleType === 'deadline' ? 'form.dueDate' : 'form.date')}
        errorText={t('form.dateRequired')}
      />
      {scheduleType === 'timed' ? (
        <>
          <TimeField
            control={control}
            name="time"
            label={t('form.time')}
            errorText={t('form.timeRequired')}
          />
          <FormSwitch control={control} name="hasDuration" label={t('form.hasDuration')} />
          {hasDuration ? (
            <Stepper
              label={t('form.duration')}
              value={durationMin}
              min={tasksConfig.durationStepMin}
              max={tasksConfig.maxDurationMin}
              step={tasksConfig.durationStepMin}
              onChange={(value) => setValue('durationMin', value, { shouldDirty: true })}
              format={(value) => t('form.durationValue', { count: value })}
            />
          ) : null}
        </>
      ) : null}
      {scheduleType === 'deadline' ? (
        <DateField
          control={control}
          name="startDate"
          label={t('form.startDate')}
          errorText={t('form.startDateInvalid')}
        />
      ) : null}

      {scope === 'this' ? null : (
        <>
          <FormSwitch control={control} name="repeat" label={t('form.repeat')} />
          {repeat ? <RecurrenceEditor control={control} date={date} /> : null}
        </>
      )}

      {scheduleType === 'all_day' ? null : (
        <View className="gap-2">
          <Body>{t('form.reminders')}</Body>
          <ChipRow label={t('form.reminders')}>
            {reminderOptions.map((minutes) => (
              <Chip
                key={minutes}
                label={reminderLabel(minutes, t)}
                selected={reminders.includes(minutes)}
                onPress={() => toggleReminder(minutes)}
              />
            ))}
          </ChipRow>
        </View>
      )}

      {canAssign && members.data ? (
        <AssigneePicker
          members={members.data as GroupMember[]}
          userId={user.id}
          value={assigneeIds}
          multiple={!editing}
          onChange={(ids) => {
            setValue('assigneeIds', ids, { shouldDirty: true });
            if (ids.length !== 1 || ids[0] !== user.id) setValue('visibility', 'group');
          }}
        />
      ) : null}
      {keepsPrivate ? (
        <SwitchRow
          label={t('form.private')}
          description={t('form.privateHint')}
          value={visibility === 'private'}
          onValueChange={(value) =>
            setValue('visibility', value ? 'private' : 'group', { shouldDirty: true })
          }
        />
      ) : null}

      <Button
        variant="secondary"
        label={t(more ? 'form.lessOptions' : 'form.moreOptions')}
        onPress={() => setMore((value) => !value)}
      />
      {more ? (
        <View style={{ gap: tokens.spacing[4] }}>
          <FormTextField
            control={control}
            name="notes"
            label={t('form.notes')}
            errorText={t('form.notesInvalid')}
            multiline
            maxLength={2000}
            style={{ minHeight: tokens.sizes.field * 2, textAlignVertical: 'top' }}
          />
          <Choice
            control={control}
            name="difficulty"
            label={t('form.difficulty')}
            options={[
              { value: 'easy', label: t('difficulty.easy') },
              { value: 'medium', label: t('difficulty.medium') },
              { value: 'hard', label: t('difficulty.hard') },
            ]}
          />
          <Choice
            control={control}
            name="priority"
            label={t('form.priority')}
            options={[
              { value: 'low', label: t('priority.low') },
              { value: 'normal', label: t('priority.normal') },
              { value: 'high', label: t('priority.high') },
            ]}
          />
          <FormSwitch
            control={control}
            name="requiresPartialReason"
            label={t('form.askReason')}
            description={t('form.askReasonHint')}
          />
        </View>
      ) : null}

      {failure ? <ErrorText>{failure}</ErrorText> : null}
      <Button
        label={t('actions.save')}
        loading={save.isPending}
        onPress={handleSubmit((values) => save.mutate(values))}
      />
      <Button variant="secondary" label={t('actions.cancel')} onPress={goBack} />
    </Screen>
  );
}
