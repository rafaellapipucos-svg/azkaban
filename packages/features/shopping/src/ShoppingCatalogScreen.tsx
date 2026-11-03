import {
  shoppingCategories,
  shoppingNameSchema,
  shoppingUnits,
  type ShoppingCatalogItem,
} from '@azkaban/contracts';
import { catalogSections } from '@azkaban/core';
import { shoppingRepository, useCurrentUser, type ShoppingCatalogItemUpdate } from '@azkaban/data';
import { useTranslation } from '@azkaban/i18n';
import {
  Body,
  Button,
  Card,
  Chip,
  ChipRow,
  ErrorText,
  Input,
  Muted,
  Screen,
  Sheet,
  Subtitle,
  Title,
} from '@azkaban/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { View } from 'react-native';
import { shoppingKeys } from './hooks';
import { canShop, shoppingErrorKey, shoppingTextErrorKey } from './shopping';

/**
 * `/shopping/catalog?group=`: the scope's catalog, to rename, recategorize, archive and restore
 * entries. A group's needs `shopping.manage_catalog`; the personal one is the owner's. New entries
 * come from "save to catalog" while building a list.
 */
export function ShoppingCatalogScreen({ groupId }: { groupId: string | null }) {
  const { t } = useTranslation('shopping');
  const queryClient = useQueryClient();
  const { user } = useCurrentUser();
  const [editing, setEditing] = useState<ShoppingCatalogItem | null>(null);
  const catalog = useQuery({
    queryKey: shoppingKeys.catalog(groupId),
    queryFn: () => shoppingRepository.catalog(groupId),
  });
  const save = useMutation({
    mutationFn: ({ id, change }: { id: string; change: ShoppingCatalogItemUpdate }) =>
      shoppingRepository.updateCatalogItem(id, change),
    onSuccess: () => setEditing(null),
    onSettled: () => queryClient.invalidateQueries({ queryKey: shoppingKeys.catalog(groupId) }),
  });

  if (!canShop(user, 'shopping.manage_catalog', groupId)) {
    return (
      <Screen title={t('catalog.title')}>
        <ErrorText>{t('errors.forbidden')}</ErrorText>
      </Screen>
    );
  }

  const rows = catalog.data ?? [];
  const archived = rows.filter(({ archivedAt }) => archivedAt !== null);

  return (
    <Screen title={t('catalog.title')}>
      <Title>{t('catalog.title')}</Title>
      <Muted>{t('catalog.hint')}</Muted>
      {catalog.isPending ? <Muted role="status">{t('lists.loading')}</Muted> : null}
      {catalog.isError ? <ErrorText>{t('lists.load')}</ErrorText> : null}
      {save.isError && !editing ? <ErrorText>{t(shoppingErrorKey(save.error))}</ErrorText> : null}

      {catalogSections(rows, '').map(({ category, items }) => (
        <View key={category} className="gap-2">
          <Subtitle>{t(`categories.${category}`)}</Subtitle>
          {items.map((entry) => (
            <Card
              key={entry.id}
              onPress={() => {
                save.reset();
                setEditing(entry);
              }}
            >
              <Body className="font-heavy">
                {entry.emoji ? `${entry.emoji} ` : ''}
                {entry.name}
              </Body>
              <Muted>{t(`unitNames.${entry.defaultUnit}`)}</Muted>
            </Card>
          ))}
        </View>
      ))}

      {archived.length > 0 ? <Subtitle>{t('catalog.archived')}</Subtitle> : null}
      {archived.map((entry) => (
        <View key={entry.id} className="gap-2">
          <Muted>{entry.name}</Muted>
          <Button
            variant="secondary"
            label={t('catalog.restore', { name: entry.name })}
            onPress={() => save.mutate({ id: entry.id, change: { archivedAt: null } })}
          />
        </View>
      ))}

      {editing ? (
        <EditSheet
          key={editing.id}
          entry={editing}
          busy={save.isPending}
          error={save.isError ? t(shoppingErrorKey(save.error)) : null}
          onSave={(change) => save.mutate({ id: editing.id, change })}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </Screen>
  );
}

function EditSheet({
  entry,
  busy,
  error,
  onSave,
  onClose,
}: {
  entry: ShoppingCatalogItem;
  busy: boolean;
  error: string | null;
  onSave: (change: ShoppingCatalogItemUpdate) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation('shopping');
  const [name, setName] = useState(entry.name);
  const [category, setCategory] = useState(entry.category);
  const [defaultUnit, setDefaultUnit] = useState(entry.defaultUnit);
  const parsed = shoppingNameSchema.safeParse(name);
  const invalid = shoppingTextErrorKey(parsed);
  const title = t('catalog.edit', { name: entry.name });
  return (
    <Sheet visible label={title} onClose={onClose}>
      <Subtitle>{title}</Subtitle>
      <Input aria-label={t('catalog.name')} value={name} onChangeText={setName} />
      {invalid ? <ErrorText>{t(invalid)}</ErrorText> : null}
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
      <ChipRow label={t('catalog.unit')}>
        {shoppingUnits.map((unit) => (
          <Chip
            key={unit}
            label={t(`unitNames.${unit}`)}
            selected={defaultUnit === unit}
            onPress={() => setDefaultUnit(unit)}
          />
        ))}
      </ChipRow>
      {error ? <ErrorText>{error}</ErrorText> : null}
      <Button
        label={t('catalog.save')}
        disabled={!parsed.success}
        loading={busy}
        onPress={() =>
          parsed.success ? onSave({ name: parsed.data, category, defaultUnit }) : undefined
        }
      />
      <Button
        variant="secondary"
        label={t('catalog.archive')}
        onPress={() => onSave({ archivedAt: new Date().toISOString() })}
      />
      <Button variant="secondary" label={t('list.close')} onPress={onClose} />
    </Sheet>
  );
}
