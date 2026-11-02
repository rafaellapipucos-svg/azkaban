import { afterEach, describe, expect, it, vi } from 'vitest';
import { currentPushSubscription, pushSupport } from './push.web';

const iphone = (version: string) =>
  `Mozilla/5.0 (iPhone; CPU iPhone OS ${version} like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/${version.replace('_', '.')} Mobile/15E148 Safari/604.1`;

function stubBrowser({
  userAgent,
  push = false,
  standalone = false,
  maxTouchPoints = 5,
}: {
  userAgent: string;
  push?: boolean;
  standalone?: boolean;
  maxTouchPoints?: number;
}) {
  vi.stubGlobal('navigator', {
    userAgent,
    maxTouchPoints,
    ...(push ? { serviceWorker: {} } : {}),
  });
  vi.stubGlobal('matchMedia', () => ({ matches: standalone }));
  if (push) {
    vi.stubGlobal('PushManager', class {});
    vi.stubGlobal('Notification', { permission: 'granted' });
  }
}

afterEach(() => vi.unstubAllGlobals());

describe('pushSupport (web)', () => {
  it('is supported wherever the browser has PushManager, an installed iPhone included', () => {
    stubBrowser({ userAgent: iphone('17_0'), push: true, standalone: true });
    expect(pushSupport()).toBe('supported');
  });

  it('asks an iPhone in Safari to add the app to the Home Screen', () => {
    stubBrowser({ userAgent: iphone('16_4') });
    expect(pushSupport()).toBe('needs_install');
  });

  it('says an iPhone before 16.4 cannot, installed or not', () => {
    stubBrowser({ userAgent: iphone('16_3') });
    expect(pushSupport()).toBe('ios_too_old');
    stubBrowser({ userAgent: iphone('15_7'), standalone: true });
    expect(pushSupport()).toBe('ios_too_old');
  });

  it('takes an iPad asking for the desktop site for an iPad, by its Safari version', () => {
    const ipad = (version: string) =>
      `Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/${version} Safari/605.1.15`;
    stubBrowser({ userAgent: ipad('16.4') });
    expect(pushSupport()).toBe('needs_install');
    stubBrowser({ userAgent: ipad('16.1') });
    expect(pushSupport()).toBe('ios_too_old');
    stubBrowser({ userAgent: ipad('16.4'), maxTouchPoints: 0 });
    expect(pushSupport()).toBe('unsupported');
  });

  it('is unsupported on a browser without push that is not an iPhone', () => {
    stubBrowser({ userAgent: 'Mozilla/5.0 (X11; Linux x86_64) Firefox/115.0', maxTouchPoints: 0 });
    expect(pushSupport()).toBe('unsupported');
  });
});

describe('currentPushSubscription (web)', () => {
  const json = { endpoint: 'https://fcm.googleapis.com/x', keys: { p256dh: 'p', auth: 'a' } };

  function stubWorker(existingKey: number[] | null) {
    const existing = existingKey && {
      options: { applicationServerKey: new Uint8Array(existingKey).buffer },
      toJSON: () => json,
      unsubscribe: vi.fn(async () => true),
    };
    const subscribe = vi.fn(async () => ({ toJSON: () => json }));
    const pushManager = { getSubscription: async () => existing, subscribe };
    stubBrowser({ userAgent: 'Chrome', push: true });
    vi.stubGlobal('navigator', {
      userAgent: 'Chrome',
      serviceWorker: { register: async () => ({}), ready: Promise.resolve({ pushManager }) },
    });
    return { existing, subscribe };
  }

  // `AQAB` is the bytes 1, 0, 1.
  it('keeps a subscription made with the same key', async () => {
    const { existing, subscribe } = stubWorker([1, 0, 1]);
    expect(await currentPushSubscription('AQAB')).toEqual({ ...json, userAgent: 'Chrome' });
    expect(subscribe).not.toHaveBeenCalled();
    expect(existing?.unsubscribe).not.toHaveBeenCalled();
  });

  it('replaces a subscription made with another key', async () => {
    const { existing, subscribe } = stubWorker([9, 9, 9]);
    await currentPushSubscription('AQAB');
    expect(existing?.unsubscribe).toHaveBeenCalled();
    expect(subscribe).toHaveBeenCalledWith({
      userVisibleOnly: true,
      applicationServerKey: new Uint8Array([1, 0, 1]),
    });
  });

  it('never subscribes without the permission', async () => {
    const { subscribe } = stubWorker(null);
    vi.stubGlobal('Notification', { permission: 'default' });
    expect(await currentPushSubscription('AQAB')).toBeNull();
    expect(subscribe).not.toHaveBeenCalled();
  });
});
