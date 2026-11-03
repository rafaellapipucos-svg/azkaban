import { shoppingShareText } from '@azkaban/core';
import { shoppingRepository, useCurrentUser } from '@azkaban/data';
import { useTranslation } from '@azkaban/i18n';
import { shareText } from '@azkaban/platform';
import {
  Button,
  ConfirmButton,
  EmptyState,
  ErrorText,
  Muted,
  Screen,
  SegmentedControl,
  Title,
} from '@azkaban/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { BuildMode } from './BuildMode';
import { MarketMode } from './MarketMode';
import { shoppingKeys, useDateText, useQuantityText, useShoppingList } from './hooks';
import { canShop, readMode, shoppingErrorKey, shoppingPaths, type ShoppingMode } from './shopping';

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
        {rows.length > 0 && left === 0 ? t('list.allDone') : t('list.left', { count: left })}
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
    </Screen>
  );
}
