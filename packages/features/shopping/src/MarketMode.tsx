import type { ShoppingListItem } from '@azkaban/contracts';
import { marketSections } from '@azkaban/core';
import { shoppingCheckAction } from '@azkaban/data';
import { useTranslation } from '@azkaban/i18n';
import { activateOnSpace } from '@azkaban/platform';
import { Body, Muted, Subtitle, tokens } from '@azkaban/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Pressable, Text, View } from 'react-native';
import { queueRefuses, useQuantityText, useSetItem } from './hooks';

type Props = {
  listId: string;
  items: ShoppingListItem[];
  /** A completed list: shown as it ended, nothing to tap. */
  readOnly: boolean;
  who: (addedBy: string | null) => string | null;
  onError: (error: unknown) => void;
};

/** "At the store": only the list, by category. Checking strikes and sinks; unchecking undoes. */
export function MarketMode({ listId, items, readOnly, who, onError }: Props) {
  const { t } = useTranslation('shopping');
  const queryClient = useQueryClient();
  const quantityText = useQuantityText();
  const setItem = useSetItem(listId);

  // Through the offline queue. Shown at once; the value (not a toggle) makes a replay harmless, and
  // the reload when it settles takes in what others did.
  const check = useMutation({ ...shoppingCheckAction, onError });
  const toggle = (item: ShoppingListItem) => {
    if (queueRefuses(queryClient)) return onError(new Error('offline'));
    const checked = item.checkedAt === null;
    setItem(item.id, { ...item, checkedAt: checked ? new Date().toISOString() : null });
    check.mutate({ itemId: item.id, checked });
  };

  const sections = marketSections(items).map(({ category, items: section }) => (
    <View key={category} className="gap-2">
      <Subtitle>{t(`categories.${category}`)}</Subtitle>
      {section.map((item) => {
        const checked = item.checkedAt !== null;
        const quantity = quantityText(item.quantity, item.unit);
        const added = who(item.addedBy);
        const name = `${item.emoji ? `${item.emoji} ` : ''}${item.name}`;
        const onPress = readOnly ? undefined : () => toggle(item);
        return (
          <Pressable
            key={item.id}
            role="checkbox"
            aria-checked={checked}
            aria-disabled={readOnly}
            aria-label={t('list.check', { name: item.name, quantity })}
            disabled={readOnly}
            onPress={onPress}
            {...activateOnSpace(onPress)}
            style={{ minHeight: tokens.sizes.touch }}
            className="flex-row items-center gap-3 rounded-lg border-2 border-border bg-surface px-4 py-2 active:opacity-70 dark:border-border-dark dark:bg-surface-dark"
          >
            <View
              aria-hidden
              style={{ width: tokens.sizes.statusRow, height: tokens.sizes.statusRow }}
              className={`items-center justify-center rounded-full border-2 ${
                checked ? 'border-doneEdge bg-done' : 'border-border dark:border-border-dark'
              }`}
            >
              {checked ? <Text className="font-heavy text-sm text-onDone">✓</Text> : null}
            </View>
            <View className="flex-1">
              {checked ? (
                <Muted className="line-through">{name}</Muted>
              ) : (
                <Body className="font-heavy">{name}</Body>
              )}
              <Muted className="text-sm">
                {quantity}
                {item.note ? ` · ${item.note}` : ''}
                {added ? ` · ${added}` : ''}
              </Muted>
            </View>
          </Pressable>
        );
      })}
    </View>
  ));
  return <>{sections}</>;
}
