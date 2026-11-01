import { taskRules } from '@azkaban/config';
import type { OccurrenceListItem, OccurrenceStatus } from '@azkaban/contracts';
import { isOverdue, occurrenceXp } from '@azkaban/core';
import { useTranslation } from '@azkaban/i18n';
import { IconButton, Muted, TaskCheck, tokens } from '@azkaban/ui';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { whenText } from './format';
import { useTransitions } from './hooks';
import { StatusActions } from './StatusActions';

/**
 * Where a task that asks for a photo goes to get it: the route composes it with the camera flow of
 * `prova-foto`, because features do not import each other. It gets the occurrence's id.
 */
export type ProofEntry = (occurrenceId: string) => void;

export type RowActions = {
  change: (item: OccurrenceListItem, to: OccurrenceStatus, reason?: string) => void;
  open: (item: OccurrenceListItem) => void;
  /**
   * Starts the photo flow of a task that asks for one (the camera of `prova-foto`). Without it the
   * check of such a task stays off, and its detail screen explains why.
   */
  proof?: (item: OccurrenceListItem) => void;
};

type Props = {
  item: OccurrenceListItem;
  timezone: string;
  now: Date;
  actions: RowActions;
  /** Shown after the time, when the list is not already grouped by context. */
  contextLabel?: string;
};

/** The change one tap on the check makes: done, or back to pending when it was resolved. */
function quickTarget(status: OccurrenceStatus): OccurrenceStatus | null {
  if (status === 'pending' || status === 'missed') return 'done';
  if (status === 'done' || status === 'partial') return 'pending';
  return null;
}

export function OccurrenceRow({ item, timezone, now, actions, contextLabel }: Props) {
  const { t, i18n } = useTranslation('tasks');
  const { available, canSendProof } = useTransitions(item);
  const [open, setOpen] = useState(false);
  const target = quickTarget(item.status);
  // A task that asks for a photo has no "feito" in `available`: its check goes to the camera.
  const toProof = canSendProof && actions.proof !== undefined;
  const allowed = toProof || (target !== null && available.some(({ to }) => to === target));
  const reviewing = item.proofReviewStatus === 'in_review';
  const disputed = item.proofReviewStatus === 'disputed';
  const needsPhoto =
    item.task.requiresPhotoProof && (item.status === 'pending' || item.status === 'missed');
  const overdue = isOverdue(item, now);
  const xp = occurrenceXp(
    {
      status: item.status,
      late: item.late,
      difficulty: item.task.difficulty,
      proofReviewStatus: item.proofReviewStatus,
    },
    taskRules.xp,
  );
  const when = whenText(item, { t, timezone, now, language: i18n.language });
  const resolved = item.status === 'done' || item.status === 'partial';

  return (
    <View
      style={{ gap: tokens.spacing[3] }}
      className="rounded-lg border-2 border-border bg-surface p-3 dark:border-border-dark dark:bg-surface-dark"
    >
      <View style={{ gap: tokens.spacing[3] }} className="flex-row items-center">
        <TaskCheck
          status={item.status}
          late={item.late}
          reviewing={reviewing}
          title={item.task.title}
          disabled={!allowed}
          onPress={() => {
            if (toProof) actions.proof?.(item);
            else if (target) actions.change(item, target);
          }}
          onLongPress={() => setOpen((value) => !value)}
        />
        <Pressable
          role="button"
          onPress={() => actions.open(item)}
          style={{ minHeight: tokens.sizes.touch }}
          className="flex-1 justify-center active:opacity-70"
        >
          <Text
            className={`font-heavy text-md text-text dark:text-text-dark ${
              // Only green is crossed out: a line through "Tentei" would read as finished.
              item.status === 'done' ? 'line-through opacity-70' : resolved ? 'opacity-70' : ''
            }`}
          >
            {item.task.title}
          </Text>
          <Muted className="text-sm">
            {contextLabel ? `${when} · ${contextLabel}` : when}
            {resolved && xp > 0 ? ` · ${t('row.xp', { count: xp })}` : ''}
          </Muted>
          {reviewing ? (
            <Text className="font-heavy text-sm text-text dark:text-text-dark">
              {t('row.inReview')}
              <Text className="font-body text-muted dark:text-muted-dark">
                {` · ${t('row.inReviewHint')}`}
              </Text>
            </Text>
          ) : null}
          {disputed ? (
            <Text className="font-heavy text-sm text-danger dark:text-danger-light">
              <Text aria-hidden>⚠ </Text>
              {t('row.disputed')}
            </Text>
          ) : null}
          {needsPhoto ? (
            <Text className="text-sm text-muted dark:text-muted-dark">
              <Text aria-hidden>📷 </Text>
              {t('row.proofHint')}
            </Text>
          ) : null}
          {overdue ? (
            <Text className="font-heavy text-sm text-danger dark:text-danger-light">
              <Text aria-hidden>⚠ </Text>
              {t('row.overdue')}
            </Text>
          ) : null}
        </Pressable>
        <IconButton
          icon="⋯"
          label={t('row.more', { title: item.task.title })}
          onPress={() => setOpen((value) => !value)}
        />
      </View>
      {open ? (
        <StatusActions
          item={item}
          available={available}
          showCancel={false}
          onChange={(to, reason) => {
            setOpen(false);
            actions.change(item, to, reason);
          }}
        />
      ) : null}
    </View>
  );
}
