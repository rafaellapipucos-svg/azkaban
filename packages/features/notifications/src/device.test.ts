import { beforeEach, describe, expect, it, vi } from 'vitest';
import { notificationsConfig } from './config';
import { enableThisDevice, stopPushWhenSignedOut } from './device';

const { items, listeners, unsubscribePush, push, repository } = vi.hoisted(() => ({
  items: new Map<string, string>(),
  listeners: [] as ((session: unknown) => void)[],
  unsubscribePush: vi.fn(async () => true),
  push: { nativePushToken: vi.fn(), subscribePush: vi.fn() },
  repository: { registerDevice: vi.fn(), registerNativeDevice: vi.fn() },
}));

vi.mock('@azkaban/data', () => ({
  authRepository: {
    onSessionChange: (listener: (session: unknown) => void) => {
      listeners.push(listener);
      return () => undefined;
    },
  },
  notificationsRepository: repository,
  notificationErrorCode: () => undefined,
}));

vi.mock('@azkaban/platform', () => ({
  storage: {
    getItem: async (key: string) => items.get(key) ?? null,
    setItem: async (key: string, value: string) => void items.set(key, value),
    removeItem: async (key: string) => void items.delete(key),
  },
  unsubscribePush,
  subscribePush: push.subscribePush,
  nativePushToken: push.nativePushToken,
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

describe('enableThisDevice', () => {
  const web = {
    endpoint: 'https://push.example/1',
    keys: { p256dh: 'p', auth: 'a' },
    userAgent: null,
  };
  const native = { token: 'ExponentPushToken[abc123]', userAgent: 'Android' };
  const enable = () => enableThisDevice('u1', 'vapid', 'Lembretes e avisos');

  beforeEach(() => {
    items.clear();
    vi.clearAllMocks();
    repository.registerDevice.mockResolvedValue('web-row');
    repository.registerNativeDevice.mockResolvedValue('native-row');
  });

  it('on native, registers the Expo token and never touches Web Push', async () => {
    push.nativePushToken.mockResolvedValue(native);
    await expect(enable()).resolves.toBe('enabled');
    expect(push.nativePushToken).toHaveBeenCalledWith({
      id: 'default',
      name: 'Lembretes e avisos',
    });
    expect(repository.registerNativeDevice).toHaveBeenCalledWith(native);
    expect(push.subscribePush).not.toHaveBeenCalled();
    expect(JSON.parse(items.get(key) ?? '')).toEqual({ userId: 'u1', deviceId: 'native-row' });
  });

  it('without a token (web, flag off, no projectId), goes by Web Push as before', async () => {
    push.nativePushToken.mockResolvedValue(null);
    push.subscribePush.mockResolvedValue(web);
    await expect(enable()).resolves.toBe('enabled');
    expect(repository.registerDevice).toHaveBeenCalledWith(web);
    expect(repository.registerNativeDevice).not.toHaveBeenCalled();
  });

  it('with neither, keeps nothing', async () => {
    push.nativePushToken.mockResolvedValue(null);
    push.subscribePush.mockResolvedValue(null);
    await expect(enable()).resolves.toBe('dismissed');
    expect(items.has(key)).toBe(false);
  });

  it('a token the repository refuses is the generic failure', async () => {
    push.nativePushToken.mockResolvedValue(native);
    repository.registerNativeDevice.mockRejectedValue(new Error('invalid_push_subscription'));
    await expect(enable()).resolves.toBe('failed');
    expect(items.has(key)).toBe(false);
  });
});
