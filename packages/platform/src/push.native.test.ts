import { beforeEach, describe, expect, it, vi } from 'vitest';

// A fake `expo-notifications`: nothing here reaches a device or the Expo servers.
const fake = vi.hoisted(() => ({
  features: { nativePush: false },
  extra: {} as Record<string, unknown>,
  status: 'undetermined',
  answer: 'granted',
  getPermissionsAsync: vi.fn(),
  requestPermissionsAsync: vi.fn(),
  getExpoPushTokenAsync: vi.fn(),
  setNotificationChannelAsync: vi.fn(async () => null),
  unregisterForNotificationsAsync: vi.fn(async () => undefined),
}));
vi.mock('@azkaban/config', () => ({ features: fake.features }));
vi.mock('expo-constants', () => ({ default: { expoConfig: { extra: fake.extra } } }));
vi.mock('react-native', () => ({ Platform: { OS: 'android' } }));
vi.mock('expo-notifications', () => ({
  PermissionStatus: { GRANTED: 'granted', DENIED: 'denied', UNDETERMINED: 'undetermined' },
  AndroidImportance: { HIGH: 4 },
  getPermissionsAsync: fake.getPermissionsAsync,
  requestPermissionsAsync: fake.requestPermissionsAsync,
  getExpoPushTokenAsync: fake.getExpoPushTokenAsync,
  setNotificationChannelAsync: fake.setNotificationChannelAsync,
  unregisterForNotificationsAsync: fake.unregisterForNotificationsAsync,
}));

const channel = { id: 'default', name: 'Lembretes e avisos' };
const load = async () => {
  vi.resetModules();
  return import('./push.native');
};

describe('native push', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    fake.features.nativePush = false;
    delete fake.extra.eas;
    fake.status = 'undetermined';
    fake.answer = 'granted';
    fake.getPermissionsAsync.mockImplementation(async () => ({
      status: fake.status,
      granted: fake.status === 'granted',
    }));
    fake.requestPermissionsAsync.mockImplementation(async () => ({
      status: fake.answer,
      granted: fake.answer === 'granted',
    }));
    fake.getExpoPushTokenAsync.mockResolvedValue({ data: 'ExponentPushToken[abc123]' });
  });

  it('with the flag off, asks nothing and says unsupported, as before', async () => {
    fake.extra.eas = { projectId: 'p1' };
    const push = await load();
    expect(await push.nativePushToken(channel)).toBeNull();
    expect(push.pushSupport()).toBe('unsupported');
    expect(push.pushPermission()).toBe('denied');
    expect(fake.getPermissionsAsync).not.toHaveBeenCalled();
    expect(fake.requestPermissionsAsync).not.toHaveBeenCalled();
  });

  it('without a projectId, does not try and says why', async () => {
    fake.features.nativePush = true;
    const push = await load();
    expect(await push.nativePushToken(channel)).toBeNull();
    expect(push.pushSupport()).toBe('unsupported');
    expect(fake.requestPermissionsAsync).not.toHaveBeenCalled();
    expect(console.warn).toHaveBeenCalledOnce();
  });

  it('creates the channel, asks, and gives the token with the system as the label', async () => {
    fake.features.nativePush = true;
    fake.extra.eas = { projectId: 'p1' };
    const push = await load();
    expect(push.pushSupport()).toBe('supported');
    await expect(push.nativePushToken(channel)).resolves.toEqual({
      token: 'ExponentPushToken[abc123]',
      userAgent: 'Android',
    });
    expect(fake.setNotificationChannelAsync).toHaveBeenCalledWith('default', {
      name: 'Lembretes e avisos',
      importance: 4,
    });
    expect(fake.getExpoPushTokenAsync).toHaveBeenCalledWith({ projectId: 'p1' });
    expect(push.pushPermission()).toBe('granted');
  });

  it('answers null and remembers the "no" when the person denies', async () => {
    fake.features.nativePush = true;
    fake.extra.eas = { projectId: 'p1' };
    fake.answer = 'denied';
    const push = await load();
    expect(await push.nativePushToken(channel)).toBeNull();
    expect(fake.getExpoPushTokenAsync).not.toHaveBeenCalled();
    expect(push.pushPermission()).toBe('denied');
  });

  it('unsubscribePush stops the device from receiving, only with the flag on', async () => {
    fake.extra.eas = { projectId: 'p1' };
    await (await load()).unsubscribePush();
    expect(fake.unregisterForNotificationsAsync).not.toHaveBeenCalled();

    fake.features.nativePush = true;
    await (await load()).unsubscribePush();
    expect(fake.unregisterForNotificationsAsync).toHaveBeenCalledOnce();
  });
});
