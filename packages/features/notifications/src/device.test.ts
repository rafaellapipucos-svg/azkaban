import { beforeEach, describe, expect, it, vi } from 'vitest';
import { notificationsConfig } from './config';
import { stopPushWhenSignedOut } from './device';

const { items, listeners, unsubscribePush } = vi.hoisted(() => ({
  items: new Map<string, string>(),
  listeners: [] as ((session: unknown) => void)[],
  unsubscribePush: vi.fn(async () => true),
}));

vi.mock('@azkaban/data', () => ({
  authRepository: {
    onSessionChange: (listener: (session: unknown) => void) => {
      listeners.push(listener);
      return () => undefined;
    },
  },
  notificationsRepository: {},
  notificationErrorCode: () => undefined,
}));

vi.mock('@azkaban/platform', () => ({
  storage: {
    getItem: async (key: string) => items.get(key) ?? null,
    setItem: async (key: string, value: string) => void items.set(key, value),
    removeItem: async (key: string) => void items.delete(key),
  },
  unsubscribePush,
  subscribePush: vi.fn(),
  currentPushSubscription: vi.fn(),
}));

const key = notificationsConfig.thisDeviceKey;
const emit = async (session: unknown) => {
  for (const listener of listeners) listener(session);
  // The listener does not wait: let its storage and unsubscribe calls settle.
  await new Promise((resolve) => setTimeout(resolve, 0));
};

describe('stopPushWhenSignedOut', () => {
  beforeEach(() => {
    items.clear();
    listeners.length = 0;
    unsubscribePush.mockClear();
    stopPushWhenSignedOut();
  });

  it('stops push and forgets this browser when the session ends by any path', async () => {
    items.set(key, JSON.stringify({ userId: 'u1', deviceId: 'd1' }));
    await emit({ user: { id: 'u1' } });
    expect(unsubscribePush).not.toHaveBeenCalled();
    expect(items.has(key)).toBe(true);

    await emit(null);
    expect(unsubscribePush).toHaveBeenCalledOnce();
    expect(items.has(key)).toBe(false);
  });

  it('leaves a browser that never turned push on alone', async () => {
    await emit(null);
    expect(unsubscribePush).not.toHaveBeenCalled();
  });
});
