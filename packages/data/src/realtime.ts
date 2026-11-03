import type {
  REALTIME_POSTGRES_CHANGES_LISTEN_EVENT,
  RealtimePostgresChangesFilter,
  RealtimePostgresChangesPayload,
} from '@supabase/supabase-js';
import { db } from './client';

type Payload = RealtimePostgresChangesPayload<Record<string, unknown>>;

export type RealtimeChange<T> = {
  filter: RealtimePostgresChangesFilter<`${REALTIME_POSTGRES_CHANGES_LISTEN_EVENT}`>;
  /** `null` drops the payload. */
  toItem: (payload: Payload) => T | null;
};

/**
 * A Realtime channel on `changes` that does not lose what is written before the server hears the
 * tables. `SUBSCRIBED` comes at once, but the server only starts hearing `postgres_changes` when it
 * sends the `system` message `ok`, seconds later on a cold Realtime, and again after a reconnect.
 * On each `ok`, `catchUp` reads back what the tables got since the call. An item with a `key` is
 * delivered once, whichever way it came; nothing is delivered after the returned unsubscribe.
 */
export function subscribeCaughtUp<T>(
  {
    name,
    changes,
    catchUp,
    key = () => null,
  }: {
    name: string;
    changes: RealtimeChange<T>[];
    catchUp: () => Promise<T[]>;
    key?: (item: T) => string | null;
  },
  onItem: (item: T) => void,
): () => void {
  let alive = true;
  const seen = new Set<string>();
  const deliver = (item: T | null) => {
    if (!alive || item === null) return;
    const id = key(item);
    if (id !== null) {
      if (seen.has(id)) return;
      seen.add(id);
    }
    onItem(item);
  };
  let channel = db().channel(name);
  for (const { filter, toItem } of changes)
    channel = channel.on('postgres_changes', filter, (payload: Payload) =>
      deliver(toItem(payload)),
    );
  channel
    .on('system', {}, (payload: { extension?: string; status?: string }) => {
      if (!alive || payload.extension !== 'postgres_changes' || payload.status !== 'ok') return;
      // A failed read leaves the gap, as before: the next change still comes by Realtime.
      catchUp()
        .then((items) => items.forEach(deliver))
        .catch(() => undefined);
    })
    .subscribe();
  return () => {
    alive = false;
    void db().removeChannel(channel);
  };
}
