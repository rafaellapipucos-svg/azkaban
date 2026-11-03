import { defaults } from '@azkaban/config';
import type { ShoppingListItem, ShoppingListStatus, ShoppingUnit } from '@azkaban/contracts';
import { formatQuantity, roundQuantity } from '@azkaban/core';
import { groupsRepository, shoppingRepository } from '@azkaban/data';
import { useTranslation } from '@azkaban/i18n';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';
import { shoppingConfig } from './shopping';

export const shoppingKeys = {
  all: ['shopping'] as const,
  lists: (groupId: string | null, status: ShoppingListStatus) =>
    ['shopping', 'lists', groupId, status] as const,
  list: (id: string) => ['shopping', 'list', id] as const,
  items: (id: string) => ['shopping', 'items', id] as const,
  catalog: (groupId: string | null) => ['shopping', 'catalog', groupId] as const,
};

/** "2 pacotes", "1,5 kg". */
export function useQuantityText() {
  const { t } = useTranslation('shopping');
  return useCallback(
    (quantity: number, unit: ShoppingUnit) =>
      t(`units.${unit}`, { count: quantity, value: formatQuantity(quantity, defaults.locale) }),
    [t],
  );
}

export function useDateText() {
  return useCallback(
    (instant: string) =>
      new Intl.DateTimeFormat(defaults.locale, { dateStyle: 'medium' }).format(new Date(instant)),
    [],
  );
}

/** One list with its items, its scope's catalog and members, kept fresh by the list's Realtime. */
export function useShoppingList(listId: string) {
  const queryClient = useQueryClient();
  const list = useQuery({
    queryKey: shoppingKeys.list(listId),
    queryFn: () => shoppingRepository.list(listId),
  });
  const items = useQuery({
    queryKey: shoppingKeys.items(listId),
    queryFn: () => shoppingRepository.items(listId),
  });
  const groupId = list.data?.groupId ?? null;
  const catalog = useQuery({
    queryKey: shoppingKeys.catalog(groupId),
    queryFn: () => shoppingRepository.catalog(groupId),
    enabled: list.isSuccess && list.data !== null,
  });
  // "Who added" by the member's name; someone not in the group any more is a former member.
  const members = useQuery({
    queryKey: ['group-members', groupId],
    queryFn: () => groupsRepository.listMembers(groupId ?? ''),
    enabled: groupId !== null,
  });

  useEffect(
    () =>
      shoppingRepository.watchList(listId, () => {
        void queryClient.invalidateQueries({ queryKey: shoppingKeys.list(listId) });
        void queryClient.invalidateQueries({ queryKey: shoppingKeys.items(listId) });
      }),
    [listId, queryClient],
  );

  return { list, items, catalog, members, groupId };
}

/**
 * Stepper taps, shown at once and sent as one delta per row after a short pause. `send` resolves
 * to a function that puts the returned row in the cache; it runs in the same tick that drops the
 * pending delta, so the screen never counts the delta twice. On failure the delta is dropped.
 * ponytail: a Realtime echo of our own delta that lands before the RPC answers counts twice for
 * that moment; tag deltas with a request id if it shows (the offline queue of F8-5 needs one too).
 */
export function usePendingDeltas(send: (key: string, delta: number) => Promise<() => void>) {
  const [pending, setPending] = useState<Record<string, number>>({});
  const queued = useRef(new Map<string, number>());
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  useEffect(() => {
    const running = timers.current;
    return () => running.forEach(clearTimeout);
  }, []);

  const shift = (key: string, delta: number) =>
    setPending((current) => ({ ...current, [key]: roundQuantity((current[key] ?? 0) + delta) }));

  const add = (key: string, delta: number) => {
    shift(key, delta);
    queued.current.set(key, roundQuantity((queued.current.get(key) ?? 0) + delta));
    clearTimeout(timers.current.get(key));
    timers.current.set(
      key,
      setTimeout(() => {
        const total = queued.current.get(key) ?? 0;
        queued.current.delete(key);
        timers.current.delete(key);
        if (total === 0) return;
        void send(key, total).then(
          (apply) => {
            apply();
            shift(key, -total);
          },
          () => shift(key, -total),
        );
      }, shoppingConfig.stepperBatchMs),
    );
  };

  return { pending, add };
}

/** Replaces or removes one row in the cached items of a list. */
export function useSetItem(listId: string) {
  const queryClient = useQueryClient();
  return (id: string, row: ShoppingListItem | null) =>
    queryClient.setQueryData<ShoppingListItem[]>(shoppingKeys.items(listId), (rows = []) => {
      const rest = rows.filter((item) => item.id !== id);
      return row ? [...rest, row] : rest;
    });
}
