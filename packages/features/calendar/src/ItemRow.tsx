import type { OccurrenceListItem } from '@azkaban/contracts';
import type { CalendarStatus } from '@azkaban/core';
import { useTranslation } from '@azkaban/i18n';
import { Muted, StatusMark, tokens } from '@azkaban/ui';
import { Pressable, Text, View } from 'react-native';
import { whenText } from './format';

type Props = {
  item: OccurrenceListItem;
  timezone: string;
  /** "🏠 Casa", when the view does not already say where the task is. */
  contextLabel?: string;
  /** Whose task it is, in the views that mix people. */
  assigneeName?: string;
  onOpen: (item: OccurrenceListItem) => void;
};

/** One occurrence in a day: its state, name and time. Tapping opens the task. */
export function ItemRow({ item, timezone, contextLabel, assigneeName, onOpen }: Props) {
  const { t } = useTranslation('calendar');
  // Cancelled ones never reach the calendar, so the four statuses are all there is.
  const status = item.status as CalendarStatus;
  // Done and waiting for an admin (ADR-0007): its own marker, and its own words below.
  const reviewing = status === 'done' && item.proofReviewStatus === 'in_review';
  const details = [
    whenText(item, { t, timezone }),
    contextLabel,
    assigneeName,
    reviewing ? t('item.inReviewText') : undefined,
  ]
    .filter(Boolean)
    .join(' · ');
  return (
    <Pressable
      role="button"
      aria-label={t('item.label', {
        title: item.task.title,
        when: details,
        status: reviewing ? t('item.inReview') : t(`status.${status}`, { ns: 'common' }),
      })}
      onPress={() => onOpen(item)}
      style={{ minHeight: tokens.sizes.touch, gap: tokens.spacing[3] }}
      className="flex-row items-center rounded-md border-2 border-border bg-surface px-3 py-2 active:opacity-70 dark:border-border-dark dark:bg-surface-dark"
    >
      <StatusMark status={status} size="row" reviewing={reviewing} />
      <View className="flex-1">
        <Text
          numberOfLines={2}
          className={`font-heavy text-md text-text dark:text-text-dark ${
            status === 'done' ? 'line-through opacity-70' : ''
          }`}
        >
          {item.task.title}
        </Text>
        <Muted className="text-sm">{details}</Muted>
      </View>
    </Pressable>
  );
}
