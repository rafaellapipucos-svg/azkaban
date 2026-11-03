import { describe, expect, it, vi } from 'vitest';
import { subscribeCaughtUp } from './realtime';

// Channels that keep their handlers, so the test plays the server. Like `RealtimeClient` in
// realtime-js 2.118, `channel(topic)` hands back the live channel with that topic, and `on` after
// `subscribe()` throws.
const fake = vi.hoisted(() => {
  type Handler = (payload: unknown) => void;
  type Channel = {
    topic: string;
    subscribed: boolean;
    handlers: Record<string, Handler[]>;
    on: (type: string, filter: unknown, handler: Handler) => Channel;
    subscribe: () => Channel;
  };
  const channels: Channel[] = [];
  const make = (topic: string): Channel => {
    const channel: Channel = {
      topic,
      subscribed: false,
      handlers: {},
      on: (type, _filter, handler) => {
        if (channel.subscribed)
          throw new Error(`cannot add ${type} callbacks for ${topic} after subscribe()`);
        (channel.handlers[type] ??= []).push(handler);
        return channel;
      },
      subscribe: () => {
        channel.subscribed = true;
        return channel;
      },
    };
    channels.push(channel);
    return channel;
  };
  const removed = vi.fn((channel: Channel) => {
    channels.splice(channels.indexOf(channel), 1);
    return Promise.resolve('ok');
  });
  return {
    channels,
    removed,
    channel: (topic: string) => channels.find((c) => c.topic === topic) ?? make(topic),
    emit: (channel: Channel, type: string, payload: unknown) =>
      channel.handlers[type]?.forEach((handler) => handler(payload)),
  };
});
vi.mock('./client', () => ({
  db: () => ({ channel: fake.channel, removeChannel: fake.removed }),
}));

const subscribe = (name: string, catchUp: () => Promise<string[]>, got: string[]) =>
  subscribeCaughtUp<string>(
    {
      name,
      changes: [
        {
          filter: { event: 'INSERT', schema: 'public', table: 't' },
          toItem: (payload) => (payload.new as { id: string }).id,
        },
      ],
      catchUp,
      key: (id) => id,
    },
    (id) => got.push(id),
  );

const ok = { extension: 'postgres_changes', status: 'ok' };
const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

describe('subscribeCaughtUp', () => {
  it('reads back on each ok, delivers a keyed item once and nothing after the unsubscribe', async () => {
    let inTable = ['a'];
    const got: string[] = [];
    const unsubscribe = subscribe('test', () => Promise.resolve(inTable), got);
    const channel = fake.channels.at(-1)!;
    const system = (payload: unknown) => fake.emit(channel, 'system', payload);
    const insert = (id: string) =>
      fake.emit(channel, 'postgres_changes', { eventType: 'INSERT', new: { id } });

    system({ extension: 'postgres_changes', status: 'error' });
    await flush();
    expect(got).toEqual([]);

    system(ok);
    await flush();
    expect(got).toEqual(['a']);

    // The same row by Realtime, then a reconnect that reads both back.
    insert('a');
    inTable = ['a', 'b'];
    system(ok);
    await flush();
    expect(got).toEqual(['a', 'b']);

    inTable = ['a', 'b', 'c'];
    system(ok);
    unsubscribe();
    await flush();
    insert('d');
    expect(got).toEqual(['a', 'b']);
    expect(fake.removed).toHaveBeenCalledOnce();
  });

  it('lets two live subscriptions share a name, each on its own channel', async () => {
    const first: string[] = [];
    const second: string[] = [];
    const unsubscribeFirst = subscribe('shopping:l1', () => Promise.resolve([]), first);
    const unsubscribeSecond = subscribe('shopping:l1', () => Promise.resolve([]), second);

    const [a, b] = fake.channels.slice(-2);
    expect(a).not.toBe(b);
    fake.emit(a!, 'postgres_changes', { eventType: 'INSERT', new: { id: 'x' } });
    fake.emit(b!, 'postgres_changes', { eventType: 'INSERT', new: { id: 'x' } });
    expect(first).toEqual(['x']);
    expect(second).toEqual(['x']);

    // A remount before `removeChannel` is done.
    unsubscribeFirst();
    const third: string[] = [];
    const unsubscribeThird = subscribe('shopping:l1', () => Promise.resolve([]), third);
    fake.emit(fake.channels.at(-1)!, 'postgres_changes', { eventType: 'INSERT', new: { id: 'y' } });
    expect(third).toEqual(['y']);
    unsubscribeSecond();
    unsubscribeThird();
  });
});
