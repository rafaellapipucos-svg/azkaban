import { MutationObserver, onlineManager, QueryClient } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  defineOfflineAction,
  discardOfflineQueue,
  isTransientFailure,
  offlineMutationDefaults,
  readOfflineDiscards,
  startOfflineQueue,
} from './index';

// The disk is a Map; `@azkaban/platform` would pull the native storage in.
const disk = vi.hoisted(() => new Map<string, string>());
vi.mock('@azkaban/platform', () => ({
  storage: {
    getItem: async (key: string) => disk.get(key) ?? null,
    setItem: async (key: string, value: string) => {
      disk.set(key, value);
    },
    removeItem: async (key: string) => {
      disk.delete(key);
    },
    getAllKeys: async () => [...disk.keys()],
  },
}));

type Vars = { n: string };
const runs: string[] = [];
let run: (vars: Vars) => Promise<unknown> = async () => null;
const action = defineOfflineAction<Vars>({
  key: 'test-action',
  schema: {
    parse: (value) => {
      if (typeof (value as Vars).n !== 'string') throw new Error('invalid');
      return value as Vars;
    },
  },
  run: (vars) => {
    runs.push(vars.n);
    return run(vars);
  },
  reasonOf: (error) => (error as Error).message,
  invalidates: () => [['things']],
});

const pause = (ms: number) => new Promise<void>((done) => setTimeout(() => done(), ms));
const refusal = (message: string) => Object.assign(new Error(message), { code: 'P0001' });
const networkFailure = () => ({ message: 'TypeError: Failed to fetch', code: '' });

const stops: (() => void)[] = [];
function start(userId: string) {
  const client = new QueryClient({ defaultOptions: { mutations: offlineMutationDefaults } });
  client.mount(); // what QueryClientProvider does: resume when the connection returns
  stops.push(() => client.unmount(), startOfflineQueue(client, userId));
  return client;
}
const tap = (client: QueryClient, n: string) =>
  void new MutationObserver(client, action).mutate({ n }).catch(() => undefined);
const savedFor = (userId: string) => disk.get(`azkaban.offline-queue.${userId}`) ?? '';
const discardsOf = () => readOfflineDiscards().filter(({ key }) => key === 'test-action');

beforeEach(() => {
  disk.clear();
  runs.length = 0;
  run = async () => null;
  onlineManager.setOnline(false);
});
afterEach(() => {
  stops.splice(0).forEach((stop) => stop());
  onlineManager.setOnline(true);
  vi.useRealTimers();
});

describe('the offline queue', () => {
  it('runs what waited in the order it was made, one at a time', async () => {
    const client = start('u1');
    let active = 0;
    let most = 0;
    run = async () => {
      active += 1;
      most = Math.max(most, active);
      await pause(5);
      active -= 1;
    };
    tap(client, 'a');
    tap(client, 'b');
    tap(client, 'c');
    expect(runs).toEqual([]);
    onlineManager.setOnline(true);
    await vi.waitFor(() => expect(runs).toEqual(['a', 'b', 'c']));
    expect(most).toBe(1);
  });

  it('keeps the waiting actions on the disk per user and sends them after a reload', async () => {
    const before = start('u1');
    tap(before, 'x');
    await vi.waitFor(() => expect(savedFor('u1')).toContain('"n":"x"'));
    stops.splice(0).forEach((stop) => stop());
    expect(savedFor('u1')).toContain('"n":"x"');

    onlineManager.setOnline(true);
    start('u2');
    await pause(20);
    expect(runs).toEqual([]);

    start('u1');
    await vi.waitFor(() => expect(runs).toEqual(['x']));
    await vi.waitFor(() => expect(savedFor('u1')).not.toContain('"n":"x"'));
  });

  it('drops an action older than maxAgeHours with a notice, without sending it', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-03T23:50:00Z'));
    const before = start('u1');
    tap(before, 'old');
    await vi.waitFor(() => expect(savedFor('u1')).toContain('"n":"old"'));
    stops.splice(0).forEach((stop) => stop());

    vi.setSystemTime(new Date('2026-11-05T00:10:00Z'));
    onlineManager.setOnline(true);
    const seen = discardsOf().length;
    start('u1');
    await vi.waitFor(() => expect(discardsOf().slice(seen)).toMatchObject([{ reason: 'expired' }]));
    expect(runs).toEqual([]);
  });

  it('drops what the server refuses, with its reason, and tries a network failure again', async () => {
    const client = start('u1');
    let failures = 0;
    run = async ({ n }) => {
      if (n === 'refused') throw refusal('forbidden');
      if (failures++ === 0) throw networkFailure();
    };
    const seen = discardsOf().length;
    tap(client, 'refused');
    tap(client, 'flaky');
    onlineManager.setOnline(true);
    await vi.waitFor(() => expect(runs).toEqual(['refused', 'flaky', 'flaky']), {
      timeout: 4000,
    });
    expect(discardsOf().slice(seen)).toMatchObject([{ reason: 'forbidden' }]);
  });

  it('checks the saved variables again, and drops a queue of another format', async () => {
    const before = start('u1');
    tap(before, 'x');
    await vi.waitFor(() => expect(savedFor('u1')).toContain('"n":"x"'));
    stops.splice(0).forEach((stop) => stop());
    disk.set('azkaban.offline-queue.u1', savedFor('u1').replace('"n":"x"', '"n":5'));
    disk.set('azkaban.offline-queue.u2', savedFor('u1').replace('"buster":"1"', '"buster":"0"'));

    onlineManager.setOnline(true);
    const seen = discardsOf().length;
    start('u1');
    start('u2');
    await vi.waitFor(() => expect(discardsOf().slice(seen)).toMatchObject([{ reason: 'invalid' }]));
    await pause(20);
    expect(runs).toEqual([]);
  });

  it('clears the queue another account left past maxAgeHours, and keeps a recent one', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-03T12:00:00Z'));
    tap(start('u1'), 'old');
    await vi.waitFor(() => expect(savedFor('u1')).toContain('"n":"old"'));
    stops.splice(0).forEach((stop) => stop());
    vi.setSystemTime(new Date('2026-11-04T11:00:00Z'));
    tap(start('u3'), 'recent');
    await vi.waitFor(() => expect(savedFor('u3')).toContain('"n":"recent"'));
    stops.splice(0).forEach((stop) => stop());
    disk.set('azkaban.offline-queue.u4', '{"buster":"1"}');
    disk.set('unrelated', 'kept');

    vi.setSystemTime(new Date('2026-11-04T12:00:01Z'));
    start('u2');
    await vi.waitFor(() => expect(disk.has('azkaban.offline-queue.u1')).toBe(false));
    await vi.waitFor(() => expect(disk.has('azkaban.offline-queue.u4')).toBe(false));
    expect(savedFor('u3')).toContain('"n":"recent"');
    expect(disk.get('unrelated')).toBe('kept');
  });

  it('fails a change outside the queue at once without a connection, and queues an action', async () => {
    const client = start('u1');
    await expect(
      new MutationObserver(client, {
        mutationFn: () => Promise.reject(new TypeError('Failed to fetch')),
      }).mutate(),
    ).rejects.toThrow('Failed to fetch');
    tap(client, 'queued');
    await vi.waitFor(() => expect(savedFor('u1')).toContain('"n":"queued"'));
    expect(client.getMutationCache().findAll({ predicate: (m) => m.state.isPaused })).toHaveLength(
      1,
    );
  });

  it('discards the whole queue from memory and from the disk', async () => {
    const client = start('u1');
    tap(client, 'x');
    await vi.waitFor(() => expect(savedFor('u1')).toContain('"n":"x"'));
    discardOfflineQueue(client);
    await vi.waitFor(() => expect(savedFor('u1')).not.toContain('"n":"x"'));
    onlineManager.setOnline(true);
    await pause(20);
    expect(runs).toEqual([]);
  });
});

describe('isTransientFailure', () => {
  it('tries network, 5xx and an expired session again, and nothing else', () => {
    expect(isTransientFailure(networkFailure())).toBe(true);
    expect(isTransientFailure({ message: '<html>502</html>' })).toBe(true);
    expect(isTransientFailure({ code: 'PGRST303', message: 'JWT expired' })).toBe(true);
    expect(isTransientFailure({ code: 'PGRST003', message: 'timed out' })).toBe(true);
    expect(isTransientFailure({ code: '40001', message: 'serialization' })).toBe(true);
    expect(isTransientFailure(new Error('wrapped', { cause: networkFailure() }))).toBe(true);

    expect(isTransientFailure(refusal('status_conflict'))).toBe(false);
    expect(isTransientFailure({ code: 'PT429', message: 'rate_limited' })).toBe(false);
    expect(isTransientFailure({ code: '42501', message: 'permission denied' })).toBe(false);
    expect(isTransientFailure({ code: '23505', message: 'duplicate key' })).toBe(false);
    expect(isTransientFailure(new Error('wrapped', { cause: refusal('forbidden') }))).toBe(false);
  });
});
