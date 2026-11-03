import { describe, expect, it, vi } from 'vitest';
import { subscribeCaughtUp } from './realtime';

// A channel that keeps its handlers, so the test plays the server.
const fake = vi.hoisted(() => {
  const handlers: Record<string, (payload: unknown) => void> = {};
  const channel = {
    on: (type: string, _filter: unknown, handler: (payload: unknown) => void) => {
      handlers[type] = handler;
      return channel;
    },
    subscribe: () => channel,
  };
  return { handlers, removed: vi.fn(), channel };
});
vi.mock('./client', () => ({
  db: () => ({ channel: () => fake.channel, removeChannel: fake.removed }),
}));

const ok = { extension: 'postgres_changes', status: 'ok' };
const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

describe('subscribeCaughtUp', () => {
  it('reads back on each ok, delivers a keyed item once and nothing after the unsubscribe', async () => {
    let inTable = ['a'];
    const got: string[] = [];
    const unsubscribe = subscribeCaughtUp<string>(
      {
        name: 'test',
        changes: [
          {
            filter: { event: 'INSERT', schema: 'public', table: 't' },
            toItem: (payload) => (payload.new as { id: string }).id,
          },
        ],
        catchUp: () => Promise.resolve(inTable),
        key: (id) => id,
      },
      (id) => got.push(id),
    );

    fake.handlers.system!({ extension: 'postgres_changes', status: 'error' });
    await flush();
    expect(got).toEqual([]);

    fake.handlers.system!(ok);
    await flush();
    expect(got).toEqual(['a']);

    // The same row by Realtime, then a reconnect that reads both back.
    fake.handlers.postgres_changes!({ eventType: 'INSERT', new: { id: 'a' } });
    inTable = ['a', 'b'];
    fake.handlers.system!(ok);
    await flush();
    expect(got).toEqual(['a', 'b']);

    inTable = ['a', 'b', 'c'];
    fake.handlers.system!(ok);
    unsubscribe();
    await flush();
    fake.handlers.postgres_changes!({ eventType: 'INSERT', new: { id: 'd' } });
    expect(got).toEqual(['a', 'b']);
    expect(fake.removed).toHaveBeenCalledOnce();
  });
});
