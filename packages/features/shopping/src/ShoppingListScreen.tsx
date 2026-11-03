import { shoppingNameSchema } from '@azkaban/contracts';
import { shoppingShareText } from '@azkaban/core';
import { shoppingRepository, useCurrentUser } from '@azkaban/data';
import { useTranslation } from '@azkaban/i18n';
import { shareText } from '@azkaban/platform';
import {
  Button,
  ConfirmButton,
  EmptyState,
  ErrorText,
  Input,
  Muted,
  Screen,
  SegmentedControl,
  Sheet,
  Subtitle,
  Title,
} from '@azkaban/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { BuildMode } from './BuildMode';
import { MarketMode } from './MarketMode';
import { shoppingKeys, useDateText, useQuantityText, useShoppingList } from './hooks';
import {
  canManageList,
  canShop,
  readMode,
  shoppingErrorKey,
  shoppingPaths,
  shoppingTextErrorKey,
  type ShoppingMode,
} from './shopping';

/**
 * `/shopping/[id]?mode=build|market`: one list. Open, it is built or shopped, shared and
 * completed; completed, it is history, the source of "new list from this".
 */
export function ShoppingListScreen({ listId, mode }: { listId: string; mode?: string }) {
  const { t } = useTranslation('shopping');
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user } = useCurrentUser();
  const { list, items, catalog, members, groupId } = useShoppingList(listId);
  const quantityText = useQuantityText();
  const date = useDateText();
  const [error, setError] = useState<unknown>(null);
  const [copied, setCopied] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const current = readMode(mode);
  const rows = items.data ?? [];
  const left = rows.filter(({ checkedAt }) => checkedAt === null).length;
  const refresh = () => queryClient.invalidateQueries({ queryKey: shoppingKeys.all });

  // Personal lists are only ever the owner's, so "who added" is said only in a group.
  const who = (addedBy: string | null) => {
    if (groupId === null || !members.isSuccess) return null;
    const member = members.data.find(({ userId }) => userId === addedBy);
    return t('list.addedBy', { name: member?.displayName ?? t('list.formerMember') });
  };

  const complete = useMutation({
    mutationFn: () => shoppingRepository.completeList({ listId }),
    onError: setError,
    onSettled: refresh,
  });
  const copy = useMutation({
    mutationFn: (name: string) =>
      shoppingRepository.createList({ groupId, name, fromListId: listId }),
    onError: setError,
    onSuccess: async (id) => {
      await refresh();
      router.push(shoppingPaths.list(id, 'build'));
    },
  });
  const rename = useMutation({
    mutationFn: (next: string) => shoppingRepository.updateList(listId, { name: next }),
    onSuccess: () => setRenaming(false),
    onSettled: refresh,
  });
  const remove = useMutation({
    mutationFn: () => shoppingRepository.deleteList(listId),
    onError: setError,
    onSuccess: () => {
      // Leave first: the list's own query would turn into "not found" under the user.
      router.replace(shoppingPaths.lists);
      void refresh();
    },
  });
  const share = useMutation({
    mutationFn: (name: string) =>
      shareText(
        shoppingShareText(name, rows, {
          category: (category) => t(`categories.${category}`),
          quantity: (item) => quantityText(item.quantity, item.unit),
        }),
      ),
    onError: setError,
    onSuccess: (result) => setCopied(result === 'copied'),
  });

  if (list.isPending || items.isPending) {
    return (
      <Screen title={t('list.loading')}>
        <Muted role="status">{t('list.loading')}</Muted>
      </Screen>
    );
  }
  if (list.isError || items.isError || !list.data) {
    return (
      <Screen title={t('lists.title')}>
        <ErrorText>{t(list.data === null ? 'list.notFound' : 'lists.load')}</ErrorText>
        <Button
          variant="secondary"
          label={t('list.back')}
          onPress={() => router.replace(shoppingPaths.lists)}
        />
      </Screen>
    );
  }

  const { name, status, completedAt } = list.data;
  const errorText = error ? <ErrorText>{t(shoppingErrorKey(error))}</ErrorText> : null;
  const manage = canManageList(user, list.data);
  // Any state: deleting a completed list takes it out of the history too (ADR-0011, section 6).
  const deleteButton = manage ? (
    <ConfirmButton
      label={t('list.delete')}
      confirmLabel={t('list.deleteConfirm')}
      loading={remove.isPending}
      onConfirm={() => remove.mutate()}
    />
  ) : null;

  if (status === 'completed') {
    return (
      <Screen title={name}>
        <Title>{name}</Title>
        {completedAt ? <Muted>{t('list.completed', { date: date(completedAt) })}</Muted> : null}
        {canShop(user, 'shopping.create_list', groupId) ? (
          <Button
            label={t('list.copy')}
            loading={copy.isPending}
            onPress={() => copy.mutate(name)}
          />
        ) : null}
        {errorText}
        <MarketMode listId={listId} items={rows} readOnly who={who} onError={setError} />
        {deleteButton}
      </Screen>
    );
  }

  return (
    <Screen title={name}>
      <Title>{name}</Title>
      <SegmentedControl<ShoppingMode>
        label={t('list.mode')}
        options={[
          { value: 'build', label: t('list.build') },
          { value: 'market', label: t('list.market') },
        ]}
        value={current}
        onChange={(next) => router.setParams({ mode: next })}
      />
      <Muted role="status">
        {rows.length === 0
          ? t('list.empty')
          : left === 0
            ? t('list.allDone')
            : t('list.left', { count: left })}
      </Muted>
      {errorText}

      {current === 'build' ? (
        <BuildMode
          listId={listId}
          groupId={groupId}
          items={rows}
          catalog={catalog.data ?? []}
          canSaveToCatalog={canShop(user, 'shopping.manage_catalog', groupId)}
          who={who}
          onError={setError}
        />
      ) : rows.length === 0 ? (
        <EmptyState text={t('list.emptyMarket')} mood="sleeping">
          <Button
            variant="secondary"
            label={t('list.toBuild')}
            onPress={() => router.setParams({ mode: 'build' })}
          />
        </EmptyState>
      ) : (
        <MarketMode listId={listId} items={rows} readOnly={false} who={who} onError={setError} />
      )}

      <Button
        variant="secondary"
        label={t('list.share')}
        disabled={left === 0}
        loading={share.isPending}
        onPress={() => share.mutate(name)}
      />
      {copied ? <Muted role="status">{t('list.copied')}</Muted> : null}
      {canShop(user, 'shopping.complete_list', groupId) ? (
        <>
          <Muted>{t('list.completeHint')}</Muted>
          <ConfirmButton
            label={t('list.complete')}
            confirmLabel={t('list.completeConfirm')}
            loading={complete.isPending}
            onConfirm={() => complete.mutate()}
          />
        </>
      ) : null}
      {manage ? (
        // The database refuses renaming a completed list, so only an open one offers it.
        <Button
          variant="secondary"
          label={t('list.rename')}
          onPress={() => {
            rename.reset();
            setRenaming(true);
          }}
        />
      ) : null}
      {deleteButton}
      {renaming ? (
        <RenameSheet
          name={name}
          busy={rename.isPending}
          // Said inside the sheet, which covers the screen, and gone with it.
          error={rename.isError ? t(shoppingErrorKey(rename.error)) : null}
          onSave={(next) => rename.mutate(next)}
          onClose={() => setRenaming(false)}
        />
      ) : null}
    </Screen>
  );
}

function RenameSheet({
  name: current,
  busy,
  error,
  onSave,
  onClose,
}: {
  name: string;
  busy: boolean;
  error: string | null;
  onSave: (name: string) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation('shopping');
  const [name, setName] = useState(current);
  const parsed = shoppingNameSchema.safeParse(name);
  const invalid = shoppingTextErrorKey(parsed);
  return (
    <Sheet visible label={t('list.renameTitle')} onClose={onClose}>
      <Subtitle>{t('list.renameTitle')}</Subtitle>
      <Input aria-label={t('list.renameName')} value={name} onChangeText={setName} />
      {invalid ? <ErrorText>{t(invalid)}</ErrorText> : null}
      {error ? <ErrorText>{error}</ErrorText> : null}
      <Button
        label={t('list.renameSave')}
        disabled={!parsed.success}
        loading={busy}
        onPress={() => (parsed.success ? onSave(parsed.data) : undefined)}
      />
      <Button variant="secondary" label={t('list.close')} onPress={onClose} />
    </Sheet>
  );
}
