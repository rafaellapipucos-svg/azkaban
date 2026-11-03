import { defaults } from '@azkaban/config';
import type { ShoppingListItem, ShoppingListStatus, ShoppingUnit } from '@azkaban/contracts';
import { formatQuantity, roundQuantity } from '@azkaban/core';
import {
  groupsRepository,
  offlineQueueFull,
  shoppingAdjustAction,
  shoppingRepository,
} from '@azkaban/data';
import { useTranslation } from '@azkaban/i18n';
import { randomId } from '@azkaban/platform';
import {
  onlineManager,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';
import { shoppingConfig } from './shopping';

export const shoppingKeys = {
  all: ['shopping'] as const,
  lists: (groupId: string | null, status: ShoppingListStatus) =>
    ['shopping', 'lists', groupId, status] as const,
  list: (id: string) => ['shopping', 'list', id] as const,
  items: (id: string) => ['shopping', 'items', id] as const,
  catalog: (groupId: string | null) => ['shopping', 'catalog', groupId] as const,
  /** The linked task as the reader sees it, and the lists linked to a task (ADR-0011, section 8). */
  linkedTask: (taskId: string) => ['shopping', 'linked-task', taskId] as const,
  taskLists: (taskId: string) => ['shopping', 'task-lists', taskId] as const,
  occurrence: (occurrenceId: string) => ['shopping', 'occurrence', occurrenceId] as const,
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
      shoppingRepository.watchList(listId, ({ deletedId }) => {
        // A `DELETE` reaches every subscriber of the table: only one of ours matters.
        const shown = queryClient.getQueryData<ShoppingListItem[]>(shoppingKeys.items(listId));
        if (deletedId && deletedId !== listId && !shown?.some(({ id }) => id === deletedId)) return;
        void queryClient.invalidateQueries({ queryKey: shoppingKeys.list(listId) });
        // While a delta of ours waits or is in flight, a reload could hold it twice (in the row and
        // still pending). The queue reloads the items when each one settles.
        if (queryClient.isMutating({ mutationKey: shoppingAdjustAction.mutationKey }) > 0) return;
        void queryClient.invalidateQueries({ queryKey: shoppingKeys.items(listId) });
      }),
    [listId, queryClient],
  );

  return { list, items, catalog, members, groupId };
}

/** Where one batch of a row's taps goes: the item once it is in the cache, else the catalog entry. */
export type StepTarget = { itemId: string } | { listId: string; catalogItemId: string };

/**
 * Stepper taps, shown at once and sent as one delta per row after a short pause, through the offline
 * queue, each send with its own `requestId` so a replay is applied once (ADR-0012, section 5). The
 * returned row goes in the cache in the same tick that drops the pending delta, so the screen never
 * counts it twice. On failure the delta is dropped. While a send waits or runs, the Realtime does not
 * reload the items; the queue reloads them when each one settles.
 */
export function usePendingDeltas(
  listId: string,
  target: (key: string) => StepTarget,
  onError: (error: unknown) => void,
) {
  const queryClient = useQueryClient();
  const setItem = useSetItem(listId);
  const step = useMutation(shoppingAdjustAction);
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
        if (queueRefuses(queryClient)) {
          shift(key, -total);
          onError(new Error('offline'));
          return;
        }
        const to = target(key);
        void step.mutateAsync({ ...to, delta: total, requestId: randomId() }).then(
          (result) => {
            // The queue types every result as unknown; this one is `adjustQuantity`'s.
            const row = result as ShoppingListItem | null;
            if ('itemId' in to) setItem(to.itemId, row);
            else if (row) setItem(row.id, row);
            shift(key, -total);
          },
          (error: unknown) => {
            shift(key, -total);
            onError(error);
          },
        );
      }, shoppingConfig.stepperBatchMs),
    );
  };

  return { pending, add };
}

/** No connection and the queue at its ceiling: the tap says "no connection" instead of waiting. */
export const queueRefuses = (queryClient: QueryClient) =>
  !onlineManager.isOnline() && offlineQueueFull(queryClient);

/** Replaces or removes one row in the cached items of a list. */
export function useSetItem(listId: string) {
  const queryClient = useQueryClient();
  return (id: string, row: ShoppingListItem | null) =>
    queryClient.setQueryData<ShoppingListItem[]>(shoppingKeys.items(listId), (rows = []) => {
      const rest = rows.filter((item) => item.id !== id);
      return row ? [...rest, row] : rest;
    });
}
