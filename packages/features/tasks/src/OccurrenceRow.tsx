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

export type RowActions = {
  change: (item: OccurrenceListItem, to: OccurrenceStatus, reason?: string) => void;
  open: (item: OccurrenceListItem) => void;
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
  const { available } = useTransitions(item);
  const [open, setOpen] = useState(false);
  const target = quickTarget(item.status);
  const allowed = target !== null && available.some(({ to }) => to === target);
  const overdue = isOverdue(item, now);
  const xp = occurrenceXp(
    { status: item.status, late: item.late, difficulty: item.task.difficulty },
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
          title={item.task.title}
          disabled={!allowed}
          onPress={() => target && actions.change(item, target)}
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
