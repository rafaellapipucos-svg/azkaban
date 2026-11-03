import { shoppingDefaults } from '@azkaban/config';
import {
  shoppingCategories,
  shoppingNameSchema,
  shoppingQuantityMax,
  shoppingUnits,
  type ShoppingCatalogItem,
  type ShoppingCategory,
  type ShoppingListItem,
  type ShoppingListItemInput,
  type ShoppingUnit,
} from '@azkaban/contracts';
import { catalogSections, exactMatch, projectQuantity, roundQuantity } from '@azkaban/core';
import { shoppingAddItemAction, shoppingRepository } from '@azkaban/data';
import { useTranslation } from '@azkaban/i18n';
import { randomId } from '@azkaban/platform';
import {
  Body,
  Button,
  Chip,
  ChipRow,
  ErrorText,
  Input,
  Muted,
  Sheet,
  Stepper,
  Subtitle,
  SwitchRow,
  tokens,
} from '@azkaban/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { queueRefuses, shoppingKeys, usePendingDeltas, useQuantityText, useSetItem } from './hooks';
import { parseNote, shoppingTextErrorKey } from './shopping';

type Props = {
  listId: string;
  groupId: string | null;
  /** Who is adding, for the item shown before the server answers. */
  userId: string;
  items: ShoppingListItem[];
  catalog: ShoppingCatalogItem[];
  /** `shopping.manage_catalog` in a group, or the owner of a personal list. */
  canSaveToCatalog: boolean;
  /** "Added by Ana", or null on a personal list. */
  who: (addedBy: string | null) => string | null;
  onError: (error: unknown) => void;
};

/** A catalog entry, with the list's item when it is on the list, or an item typed outside it. */
type Row = {
  key: string;
  name: string;
  category: ShoppingCategory;
  emoji: string | null;
  unit: ShoppingUnit;
  sortOrder: number;
  archivedAt: null;
  item?: ShoppingListItem;
};

/** "Build": the scope's catalog by category, with search, stepper, unit and a typed item. */
export function BuildMode({
  listId,
  groupId,
  userId,
  items,
  catalog,
  canSaveToCatalog,
  who,
  onError,
}: Props) {
  const { t } = useTranslation('shopping');
  const queryClient = useQueryClient();
  const quantityText = useQuantityText();
  const setItem = useSetItem(listId);
  const [query, setQuery] = useState('');
  const [unitFor, setUnitFor] = useState<ShoppingListItem | null>(null);
  const [noteFor, setNoteFor] = useState<ShoppingListItem | null>(null);

  const live = catalog.filter(({ archivedAt }) => archivedAt === null);
  const linked = new Map(items.map((item) => [item.catalogItemId, item]));
  const liveIds = new Set(live.map(({ id }) => id));
  const rows: Row[] = [
    ...live.map((entry) => {
      const item = linked.get(entry.id);
      return {
        key: entry.id,
        name: item?.name ?? entry.name,
        category: item?.category ?? entry.category,
        emoji: item?.emoji ?? entry.emoji,
        unit: item?.unit ?? entry.defaultUnit,
        sortOrder: entry.sortOrder,
        archivedAt: null,
        item,
      };
    }),
    // Typed outside the catalog, or from an entry archived since: after the catalog's own rows.
    ...items
      .filter(({ catalogItemId }) => catalogItemId === null || !liveIds.has(catalogItemId))
      .map((item) => ({
        key: item.id,
        name: item.name,
        category: item.category,
        emoji: item.emoji,
        unit: item.unit,
        sortOrder: Number.MAX_SAFE_INTEGER,
        archivedAt: null,
        item,
      })),
  ];

  // A catalog row is keyed by its catalog id, so the first taps on an entry add up before the item
  // exists. The request goes by the item once it is in the cache, and by the catalog entry before.
  const { pending, add } = usePendingDeltas(
    listId,
    (key) => {
      const cached = queryClient.getQueryData<ShoppingListItem[]>(shoppingKeys.items(listId)) ?? [];
      const found = cached.find((item) => item.id === key || item.catalogItemId === key);
      return found ? { itemId: found.id } : { listId, catalogItemId: key };
    },
    onError,
  );

  // A typed item waits in the offline queue with an id made here, and shows at once.
  const addItem = useMutation({
    ...shoppingAddItemAction,
    onMutate: (input: ShoppingListItemInput) =>
      setItem(input.id ?? '', {
        ...input,
        id: input.id ?? '',
        addedBy: userId,
        addedAt: new Date().toISOString(),
        checkedAt: null,
        checkedBy: null,
      }),
    onError,
  });

  const run = async (action: () => Promise<unknown>) => {
    try {
      await action();
    } catch (error) {
      onError(error);
    }
    await queryClient.invalidateQueries({ queryKey: shoppingKeys.items(listId) });
  };

  const typed = shoppingNameSchema.safeParse(query);
  const invalid = shoppingTextErrorKey(typed);
  const known = exactMatch([...live, ...items], query);

  return (
    <>
      <Input
        aria-label={t('list.search')}
        placeholder={t('list.searchPlaceholder')}
        value={query}
        onChangeText={setQuery}
        returnKeyType="search"
      />
      {invalid ? <ErrorText>{t(invalid)}</ErrorText> : null}
      {typed.success && !known ? (
        <CustomItem
          key={typed.data}
          name={typed.data}
          canSave={canSaveToCatalog}
          onAdd={async (category, save) => {
            if (queueRefuses(queryClient)) return onError(new Error('offline'));
            const { unit } = shoppingDefaults.customItem;
            let catalogItemId: string | null = null;
            // The catalog never waits in the queue: saving to it needs the connection.
            if (save) {
              try {
                catalogItemId = (
                  await shoppingRepository.addCatalogItem({
                    groupId,
                    name: typed.data,
                    category,
                    defaultUnit: unit,
                    emoji: null,
                  })
                ).id;
              } catch (error) {
                return onError(error);
              }
              await queryClient.invalidateQueries({ queryKey: shoppingKeys.catalog(groupId) });
            }
            addItem.mutate({
              id: randomId(),
              listId,
              catalogItemId,
              name: typed.data,
              category,
              quantity: shoppingDefaults.unitStep[unit],
              unit,
              emoji: null,
              note: null,
            });
            setQuery('');
          }}
        />
      ) : null}

      {catalogSections(rows, query).map(({ category, items: section }) => (
        <View key={category} className="gap-2">
          <Subtitle>{t(`categories.${category}`)}</Subtitle>
          {section.map((row) => {
            const value = projectQuantity(row.item?.quantity ?? 0, pending[row.key] ?? 0) ?? 0;
            const step = shoppingDefaults.unitStep[row.unit];
            const added = row.item && value > 0 ? who(row.item.addedBy) : null;
            return (
              <View
                key={row.key}
                className="gap-2 rounded-lg border-2 border-border bg-surface p-3 dark:border-border-dark dark:bg-surface-dark"
              >
                <View>
                  <Body className={value > 0 ? 'font-heavy' : ''}>
                    {row.emoji ? `${row.emoji} ` : ''}
                    {row.name}
                  </Body>
                  {row.item?.note && value > 0 ? (
                    <Muted className="text-sm">{row.item.note}</Muted>
                  ) : null}
                  {added ? <Muted className="text-sm">{added}</Muted> : null}
                </View>
                <View className="flex-row flex-wrap items-center justify-between gap-2">
                  {row.item && value > 0 ? (
                    <View className="flex-row flex-wrap gap-2">
                      <Pill
                        label={t('list.unit', {
                          name: row.name,
                          unit: t(`unitNames.${row.unit}`),
                        })}
                        text={`${t(`unitNames.${row.unit}`)} ▾`}
                        onPress={() => setUnitFor(row.item ?? null)}
                      />
                      <Pill
                        label={t('list.note', { name: row.name })}
                        text={t('list.noteAction')}
                        onPress={() => setNoteFor(row.item ?? null)}
                      />
                    </View>
                  ) : (
                    <View />
                  )}
                  <Stepper
                    label={row.name}
                    value={value}
                    step={step}
                    // Minus stays on while there is any quantity: at zero or below the item leaves.
                    min={value > 0 ? value - step : 0}
                    max={shoppingQuantityMax}
                    format={(quantity) => quantityText(quantity, row.unit)}
                    onChange={(next) => add(row.key, roundQuantity(next - value))}
                  />
                </View>
              </View>
            );
          })}
        </View>
      ))}

      <Sheet
        visible={unitFor !== null}
        label={t('list.unitTitle', { name: unitFor?.name ?? '' })}
        onClose={() => setUnitFor(null)}
      >
        <Subtitle>{t('list.unitTitle', { name: unitFor?.name ?? '' })}</Subtitle>
        <ChipRow label={t('list.unitTitle', { name: unitFor?.name ?? '' })}>
          {shoppingUnits.map((unit) => (
            <Chip
              key={unit}
              label={t(`unitNames.${unit}`)}
              selected={unitFor?.unit === unit}
              onPress={() => {
                const target = unitFor;
                setUnitFor(null);
                if (target && target.unit !== unit) {
                  void run(() => shoppingRepository.updateItem(target.id, { unit }));
                }
              }}
            />
          ))}
        </ChipRow>
        <Button variant="secondary" label={t('list.close')} onPress={() => setUnitFor(null)} />
      </Sheet>

      {noteFor ? (
        <NoteSheet
          key={noteFor.id}
          item={noteFor}
          onSave={(note) => {
            const target = noteFor;
            setNoteFor(null);
            if (note !== target.note)
              void run(() => shoppingRepository.updateItem(target.id, { note }));
          }}
          onClose={() => setNoteFor(null)}
        />
      ) : null}
    </>
  );
}

function Pill({ label, text, onPress }: { label: string; text: string; onPress: () => void }) {
  return (
    <Pressable
      role="button"
      aria-label={label}
      onPress={onPress}
      style={{ minHeight: tokens.sizes.touch }}
      className="justify-center rounded-full border-2 border-border px-4 active:opacity-70 dark:border-border-dark"
    >
      <Text className="font-heavy text-md text-primary dark:text-primary-light">{text}</Text>
    </Pressable>
  );
}

/** The item's note, last write wins (ADR-0011, section 5). Blank clears it. */
function NoteSheet({
  item,
  onSave,
  onClose,
}: {
  item: ShoppingListItem;
  onSave: (note: string | null) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation('shopping');
  const [note, setNote] = useState(item.note ?? '');
  const parsed = parseNote(note);
  const invalid = shoppingTextErrorKey(parsed);
  const title = t('list.note', { name: item.name });
  return (
    <Sheet visible label={title} onClose={onClose}>
      <Subtitle>{title}</Subtitle>
      <Input
        aria-label={title}
        placeholder={t('list.noteHint')}
        value={note}
        onChangeText={setNote}
      />
      {invalid ? <ErrorText>{t(invalid)}</ErrorText> : null}
      <Button
        label={t('list.noteSave')}
        disabled={!parsed.success}
        onPress={() => (parsed.success ? onSave(parsed.data) : undefined)}
      />
      <Button variant="secondary" label={t('list.close')} onPress={onClose} />
    </Sheet>
  );
}

function CustomItem({
  name,
  canSave,
  onAdd,
}: {
  name: string;
  canSave: boolean;
  onAdd: (category: ShoppingCategory, save: boolean) => Promise<void>;
}) {
  const { t } = useTranslation('shopping');
  const [category, setCategory] = useState<ShoppingCategory>(shoppingDefaults.customItem.category);
  const [save, setSave] = useState(false);
  const [busy, setBusy] = useState(false);
  return (
    <View className="gap-3 rounded-lg border-2 border-primary bg-surface p-4 dark:bg-surface-dark">
      <Subtitle>{t('list.custom.title', { name })}</Subtitle>
      <ChipRow label={t('list.custom.category')}>
        {shoppingCategories.map((key) => (
          <Chip
            key={key}
            label={t(`categories.${key}`)}
            selected={category === key}
            onPress={() => setCategory(key)}
          />
        ))}
      </ChipRow>
      {canSave ? (
        <SwitchRow
          label={t('list.custom.save')}
          description={t('list.custom.saveHint')}
          value={save}
          onValueChange={setSave}
        />
      ) : null}
      <Button
        label={t('list.custom.add')}
        loading={busy}
        onPress={() => {
          setBusy(true);
          void onAdd(category, save).finally(() => setBusy(false));
        }}
      />
    </View>
  );
}
