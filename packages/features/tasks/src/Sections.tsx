import type { Context, OccurrenceListItem } from '@azkaban/contracts';
import { groupByContext } from '@azkaban/core';
import { useTranslation } from '@azkaban/i18n';
import { Subtitle, tokens } from '@azkaban/ui';
import type { ReactNode } from 'react';
import { Text, View } from 'react-native';
import { OccurrenceRow, type RowActions } from './OccurrenceRow';

/** A titled block of the screen: "Atrasadas", "Hoje", "Prazos chegando". */
export function Section({
  title,
  danger,
  children,
}: {
  title: string;
  danger?: boolean;
  children: ReactNode;
}) {
  return (
    <View style={{ gap: tokens.spacing[3] }}>
      <Subtitle className={danger ? 'text-danger dark:text-danger' : ''}>{title}</Subtitle>
      {children}
    </View>
  );
}

function ContextHeader({ context }: { context: Context | undefined }) {
  const { t } = useTranslation('tasks');
  const color = tokens.contextColors[context?.colorToken as tokens.ContextColorToken];
  return (
    <View style={{ gap: tokens.spacing[2] }} className="flex-row items-center">
      <View
        aria-hidden
        style={{ backgroundColor: color ?? tokens.colors.muted, width: 12, height: 12 }}
        className="rounded-full"
      />
      <Text aria-hidden className="text-md">
        {context?.icon}
      </Text>
      <Text role="heading" className="font-heavy text-md text-muted dark:text-muted-dark">
        {context?.name ?? t('sections.otherContext')}
      </Text>
    </View>
  );
}

type ListProps = {
  items: readonly OccurrenceListItem[];
  contexts: readonly Context[];
  timezone: string;
  now: Date;
  actions: RowActions;
};

/** The items of one section, one block per context. */
export function ContextGroups({ items, contexts, timezone, now, actions }: ListProps) {
  return (
    <View style={{ gap: tokens.spacing[4] }}>
      {groupByContext(items).map((group) => (
        <View key={group.contextId} style={{ gap: tokens.spacing[2] }}>
          <ContextHeader context={contexts.find(({ id }) => id === group.contextId)} />
          {group.items.map((item) => (
            <OccurrenceRow
              key={item.id}
              item={item}
              timezone={timezone}
              now={now}
              actions={actions}
            />
          ))}
        </View>
      ))}
    </View>
  );
}
