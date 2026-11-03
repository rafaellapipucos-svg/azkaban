import { offlineDefaults } from '@azkaban/config';
import { storage } from '@azkaban/platform';
import {
  dehydrate,
  hydrate,
  useMutationState,
  type DehydratedState,
  type Mutation,
  type MutationFunctionContext,
  type QueryClient,
  type QueryKey,
} from '@tanstack/react-query';
import { useEffect, useMemo, useSyncExternalStore } from 'react';

/**
 * The offline queue (ADR-0012, section 5): TanStack Query mutations that pause without a connection,
 * run one at a time in the order they were made, and survive a reload because the paused ones are
 * saved in `storage`, under a key per user. Only the variables reach the disk, so every action is
 * registered here, with its function, before the saved ones are resumed. Lateness is decided by the
 * server clock when the action finally runs, never by the device's.
 */

/** Bump when the variables of an action change shape: the old queue is dropped, not run wrong. */
const formatVersion = '1';
const maxAgeMs = offlineDefaults.maxAgeHours * 3_600_000;
const keyPrefix = 'azkaban.offline-queue.';
const storageKey = (userId: string) => `${keyPrefix}${userId}`;

/**
 * For the app's QueryClient: a change outside the queue fails at once without a connection, with the
 * usual network error, instead of pausing unseen (ADR-0012, section 5). The queue's actions declare
 * `online` themselves, so they still wait.
 */
export const offlineMutationDefaults = { networkMode: 'always' } as const;

const savedAtOf = (text: string | null) => {
  try {
    const savedAt = (JSON.parse(text ?? '') as { savedAt?: unknown } | null)?.savedAt;
    return typeof savedAt === 'number' ? savedAt : Number.NaN;
  } catch {
    return Number.NaN;
  }
};

/**
 * A queue nobody came back for (another account, a shared device) leaves the disk once it is past
 * `maxAgeHours` (SEG8-5); one without a readable `savedAt` too. The signed-in user's own goes
 * through the restore, which drops its old actions with a notice.
 */
async function dropStaleQueues(ownKey: string) {
  for (const key of await storage.getAllKeys()) {
    if (!key.startsWith(keyPrefix) || key === ownKey) continue;
    if (!(Date.now() - savedAtOf(await storage.getItem(key)) <= maxAgeMs))
      await storage.removeItem(key);
  }
}

/** Why the queue dropped an action without asking the server. */
export class OfflineDiscardError extends Error {
  constructor(readonly reason: 'expired' | 'invalid') {
    super(reason);
    this.name = 'OfflineDiscardError';
  }
}

// SQLSTATE classes and PostgREST codes worth another try: connection (PGRST0xx, 08), the JWT that
// the session will renew (PGRST3xx, 401), serialization and deadlock (40), resources (53), operator
// intervention (57), system (58) and internal (XX).
const transientCode = /^(PGRST0|PGRST3|08|40|53|57|58|XX)/;

/**
 * Network, 5xx and 401 are tried again; a business error is final. PostgREST sends network failures
 * and non-JSON gateway errors without a code. Repositories wrap the original error as `cause`.
 */
export function isTransientFailure(error: unknown): boolean {
  if (error instanceof OfflineDiscardError) return false;
  let deepest = error;
  while (deepest instanceof Error && deepest.cause !== undefined) deepest = deepest.cause;
  const code =
    typeof deepest === 'object' && deepest !== null && 'code' in deepest ? deepest.code : undefined;
  return typeof code !== 'string' || code === '' || transientCode.test(code);
}

export type OfflineActionSpec<V> = {
  key: string;
  /** Checks the variables again before running: what comes back from the disk is the user's. */
  schema: { parse: (value: unknown) => V };
  run: (variables: V) => Promise<unknown>;
  /** The reason a refused action is dropped with, for the notice. */
  reasonOf: (error: unknown) => string;
  /** What to refresh when it settles, also after a reload, when no screen is waiting for it. */
  invalidates: (variables: V) => QueryKey[];
};

type Registered = {
  key: string;
  reasonOf: (error: unknown) => string;
  options: Parameters<QueryClient['setMutationDefaults']>[1] & { mutationKey: string[] };
};
const actions = new Map<string, Registered>();

const actionOf = (mutation: Mutation) => actions.get(String(mutation.options.mutationKey?.[0]));

/** Waiting in the queue: paused, and one of the registered actions. */
const isQueued = (mutation: Mutation) =>
  mutation.state.isPaused && actionOf(mutation) !== undefined;

// The mutation of these variables, found by identity: TanStack passes its own `state.variables`.
const ageOf = (client: QueryClient, variables: unknown) => {
  const mutation = client
    .getMutationCache()
    .find({ predicate: (m) => m.state.variables === variables });
  return mutation ? Date.now() - mutation.state.submittedAt : 0;
};

function optionsFor<V>(spec: OfflineActionSpec<V>) {
  return {
    mutationKey: [spec.key] as [string],
    scope: { id: 'offline-queue' },
    networkMode: 'online' as const,
    // ponytail: a server defect that keeps answering 5xx holds the queue until the action passes
    // `maxAgeHours`; cap the attempts if that ever shows up.
    retry: (_failures: number, error: unknown) => isTransientFailure(error),
    mutationFn: async (variables: V, { client }: MutationFunctionContext) => {
      if (ageOf(client, variables) > maxAgeMs) throw new OfflineDiscardError('expired');
      let checked: V;
      try {
        checked = spec.schema.parse(variables);
      } catch {
        throw new OfflineDiscardError('invalid');
      }
      return spec.run(checked);
    },
    // Cancel first: a read still in flight would bring back the state from before the change.
    onSettled: (
      _data: unknown,
      _error: unknown,
      variables: V,
      _result: unknown,
      { client }: MutationFunctionContext,
    ) =>
      Promise.all(
        spec.invalidates(variables).map(async (queryKey) => {
          await client.cancelQueries({ queryKey });
          await client.invalidateQueries({ queryKey });
        }),
      ),
  };
}

/**
 * Registers an action of the queue and returns its mutation options, to spread into `useMutation`
 * (add `onMutate` for the optimistic change; keep `onSettled`). Call it at module level in
 * `packages/data`, so it is registered before `useOfflineQueue` resumes a saved queue.
 */
export function defineOfflineAction<V>(spec: OfflineActionSpec<V>) {
  const options = optionsFor(spec);
  // The registry runs restored mutations, whose variables are only checked inside `mutationFn`.
  actions.set(spec.key, { key: spec.key, reasonOf: spec.reasonOf, options: options as never });
  return options;
}

// Discarded actions, for the notice. Kept for the tab's life, until the person closes each one.
export type OfflineDiscard = { id: number; key: string; reason: string };
let discards: OfflineDiscard[] = [];
let nextDiscardId = 1;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((listener) => listener());

function addDiscard(key: string, reason: string) {
  discards = [...discards, { id: nextDiscardId++, key, reason }];
  notify();
}

export function dismissOfflineDiscard(id: number) {
  discards = discards.filter((discard) => discard.id !== id);
  notify();
}

/** Every action the queue dropped so far, outside React. */
export const readOfflineDiscards = () => discards;

const subscribeDiscards = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

/** Actions of `key` the queue dropped, with the reason: expired, invalid, or a refusal code. */
export function useOfflineDiscards(key: string): OfflineDiscard[] {
  const all = useSyncExternalStore(subscribeDiscards, readOfflineDiscards, readOfflineDiscards);
  return useMemo(() => all.filter((discard) => discard.key === key), [all, key]);
}

/** How many actions wait in the queue, of every module. */
export function useOfflinePendingCount(): number {
  return useMutationState({ filters: { predicate: isQueued }, select: (m) => m.mutationId }).length;
}

/** Past `maxItems`, a tap fails with the usual "no connection" message instead of queueing. */
export function offlineQueueFull(client: QueryClient): boolean {
  return (
    client.getMutationCache().findAll({ predicate: isQueued }).length >= offlineDefaults.maxItems
  );
}

/**
 * Drops every waiting action of the signed-in user, from memory and from the disk. For signing out
 * with a confirmation, and for deleting the account.
 */
export function discardOfflineQueue(client: QueryClient) {
  const cache = client.getMutationCache();
  for (const mutation of cache.getAll()) if (actionOf(mutation)) cache.remove(mutation);
}

// Waited (offline, or behind another action) or came from the disk: its refusal becomes a notice,
// since the screen that made it may be gone. A refusal of a tap sent at once is the screen's error.
// Notifications arrive batched, so the connection at that moment says nothing about the pause.
const queuedIds = new Set<number>();

/**
 * Restores the user's saved queue, keeps saving it and sends it, and clears the stale queues of other
 * accounts from the disk. Returns the stop function, which
 * leaves the saved queue on the disk (a session that expired signs in again to the same queue) and
 * takes it out of memory, so the next account never runs it.
 */
export function startOfflineQueue(client: QueryClient, userId: string): () => void {
  const key = storageKey(userId);
  const cache = client.getMutationCache();
  for (const { options } of actions.values())
    client.setMutationDefaults(options.mutationKey, options);
  let active = true;
  // Nothing is saved before the restore, or the empty memory would overwrite the saved queue.
  let restored = false;
  void dropStaleQueues(key).catch(() => undefined);

  const save = () =>
    storage
      .setItem(
        key,
        JSON.stringify({
          buster: formatVersion,
          savedAt: Date.now(),
          clientState: dehydrate(client, {
            shouldDehydrateQuery: () => false,
            shouldDehydrateMutation: isQueued,
          }),
        }),
      )
      .catch(() => undefined);

  const unsubscribe = cache.subscribe((event) => {
    if (!('mutation' in event) || !event.mutation) return;
    const action = actionOf(event.mutation);
    if (!action) return;
    if (event.type === 'updated') {
      const id = event.mutation.mutationId;
      const { action: change } = event;
      if (change.type === 'pause' || (change.type === 'pending' && change.isPaused))
        queuedIds.add(id);
      if (change.type === 'success') queuedIds.delete(id);
      if (change.type === 'error' && queuedIds.delete(id)) {
        const { error } = change;
        addDiscard(
          action.key,
          error instanceof OfflineDiscardError ? error.reason : action.reasonOf(error),
        );
      }
    }
    if (restored) void save();
  });

  void (async () => {
    try {
      const text = await storage.getItem(key);
      if (!active) return;
      const saved = (text ? JSON.parse(text) : null) as {
        buster?: unknown;
        clientState?: DehydratedState;
      } | null;
      if (saved?.buster === formatVersion && Array.isArray(saved.clientState?.mutations)) {
        const before = new Set(cache.getAll());
        hydrate(client, {
          queries: [],
          mutations: saved.clientState.mutations.filter((m) =>
            actions.has(String(m?.mutationKey?.[0])),
          ),
        });
        for (const mutation of cache.getAll())
          if (!before.has(mutation)) queuedIds.add(mutation.mutationId);
      }
    } catch {
      // Unreadable or damaged: the save below replaces it.
    }
    if (!active) return;
    restored = true;
    void save();
    void client.resumePausedMutations();
  })();

  return () => {
    active = false;
    unsubscribe();
    for (const mutation of cache.getAll()) {
      if (!actionOf(mutation)) continue;
      queuedIds.delete(mutation.mutationId);
      cache.remove(mutation);
    }
  };
}

/** Runs the queue of the signed-in user. Mount once, in the root layout, with the app's client. */
export function useOfflineQueue(client: QueryClient, userId: string | null) {
  useEffect(() => (userId ? startOfflineQueue(client, userId) : undefined), [client, userId]);
}
