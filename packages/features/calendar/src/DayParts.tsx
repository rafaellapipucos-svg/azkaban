import type { OccurrenceListItem } from '@azkaban/contracts';
import type { DayInfo } from '@azkaban/core';
import { useTranslation } from '@azkaban/i18n';
import { Body, Muted, Subtitle, tokens } from '@azkaban/ui';
import { Text, View } from 'react-native';
import { ItemRow } from './ItemRow';

/** What the views share: how to label a row and what a tap does. */
export type DayActions = {
  timezone: string;
  contextLabelOf: (item: OccurrenceListItem) => string | undefined;
  assigneeNameOf: (item: OccurrenceListItem) => string | undefined;
  onOpen: (item: OccurrenceListItem) => void;
  /** Starts a new task on `date`, at `time` (`HH:mm`) when the tap was on an hour. */
  onCreate: (date: string, time?: string) => void;
};

/** The rows of a list of occurrences. */
export function ItemList({
  items,
  actions,
}: {
  items: readonly OccurrenceListItem[];
  actions: DayActions;
}) {
  return (
    <View style={{ gap: tokens.spacing[2] }}>
      {items.map((item) => (
        <ItemRow
          key={item.id}
          item={item}
          timezone={actions.timezone}
          contextLabel={actions.contextLabelOf(item)}
          assigneeName={actions.assigneeNameOf(item)}
          onOpen={actions.onOpen}
        />
      ))}
    </View>
  );
}

/** The highlight of a day where everything is green. */
export function PerfectBanner({ info }: { info: DayInfo | undefined }) {
  const { t } = useTranslation('calendar');
  if (!info?.perfect) return null;
  return (
    <View
      role="status"
      style={{ gap: tokens.spacing[2] }}
      className="flex-row items-center rounded-md border-2 border-done bg-surface p-3 dark:bg-surface-dark"
    >
      <Text aria-hidden className="text-lg">
        ⭐
      </Text>
      <Body className="flex-1 font-heavy">{t('day.perfect')}</Body>
    </View>
  );
}

/** A titled block of a day, such as "Prazos do dia". */
export function Block({
  title,
  empty,
  items,
  actions,
}: {
  title: string;
  /** Said when `items` is empty; without it an empty block is left out. */
  empty?: string;
  items: readonly OccurrenceListItem[];
  actions: DayActions;
}) {
  if (items.length === 0 && !empty) return null;
  return (
    <View style={{ gap: tokens.spacing[2] }}>
      <Subtitle>{title}</Subtitle>
      {items.length === 0 ? <Muted>{empty}</Muted> : <ItemList items={items} actions={actions} />}
    </View>
  );
}
