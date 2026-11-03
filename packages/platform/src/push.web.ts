import type { PushPermission, PushSubscriptionData, PushSupport } from './push';

export type { PushPermission, PushSubscriptionData, PushSupport } from './push';

/** Served from the root by `apps/app/public`, with scope `/`. */
const workerUrl = '/sw.js';
/** Same cap as the contract and the database put on the label. */
const userAgentMaxLength = 256;
/** Web Push on iPhone and iPad arrived with iOS 16.4. */
const iosPushSince = [16, 4] as const;

const hasPush = () =>
  'serviceWorker' in navigator && 'PushManager' in globalThis && 'Notification' in globalThis;

function isIos() {
  const ua = navigator.userAgent;
  // iPadOS asks for the desktop site and says Macintosh; the touch points give it away.
  return /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
}

function iosVersion(): [number, number] | null {
  // "CPU iPhone OS 16_4 like Mac OS X"; the desktop iPad has only Safari's "Version/16.4".
  const ua = navigator.userAgent;
  const match =
    /OS (\d+)_(\d+)(?:_\d+)? like Mac OS X/.exec(ua) ?? /Version\/(\d+)\.(\d+)/.exec(ua);
  return match ? [Number(match[1]), Number(match[2])] : null;
}

const standalone = () =>
  globalThis.matchMedia?.('(display-mode: standalone)').matches === true ||
  (navigator as { standalone?: boolean }).standalone === true;

export function pushSupport(): PushSupport {
  if (hasPush()) return 'supported';
  if (!isIos()) return 'unsupported';
  const version = iosVersion();
  const [major, minor] = iosPushSince;
  if (version && (version[0] < major || (version[0] === major && version[1] < minor))) {
    return 'ios_too_old';
  }
  // Opened from the icon and still no PushManager: nothing the person can do here.
  return standalone() ? 'unsupported' : 'needs_install';
}

export function pushPermission(): PushPermission {
  return hasPush() ? Notification.permission : 'denied';
}

function keyBytes(base64url: string) {
  const base64 = base64url.replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, '=')), (c) =>
    c.charCodeAt(0),
  );
}

function sameKey(subscription: PushSubscription, key: Uint8Array) {
  const current = subscription.options.applicationServerKey;
  if (!current) return false;
  const bytes = new Uint8Array(current);
  return bytes.length === key.length && bytes.every((byte, i) => byte === key[i]);
}

function toData(subscription: PushSubscription): PushSubscriptionData | null {
  const { endpoint, keys } = subscription.toJSON();
  if (!endpoint || !keys?.p256dh || !keys.auth) return null;
  return {
    endpoint,
    keys: { p256dh: keys.p256dh, auth: keys.auth },
    userAgent: navigator.userAgent.slice(0, userAgentMaxLength) || null,
  };
}

async function registration() {
  await navigator.serviceWorker.register(workerUrl, { scope: '/' });
  // `subscribe` needs an active worker, which `register` alone does not wait for.
  return navigator.serviceWorker.ready;
}

/** A subscription made with another key only takes pushes signed by it, so it is replaced. */
async function subscribed(vapidPublicKey: string) {
  const key = keyBytes(vapidPublicKey);
  const { pushManager } = await registration();
  const existing = await pushManager.getSubscription();
  if (existing && sameKey(existing, key)) return existing;
  await existing?.unsubscribe();
  return pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
}

export async function subscribePush(vapidPublicKey: string) {
  if (!hasPush()) return null;
  if ((await Notification.requestPermission()) !== 'granted') return null;
  return toData(await subscribed(vapidPublicKey));
}

export async function currentPushSubscription(vapidPublicKey: string) {
  if (pushPermission() !== 'granted') return null;
  return toData(await subscribed(vapidPublicKey));
}

export async function unsubscribePush() {
  if (!hasPush()) return;
  const current = await navigator.serviceWorker.getRegistration('/');
  await (await current?.pushManager.getSubscription())?.unsubscribe();
}

/** Native only: `sw.js` opens a tapped notification here. */
export async function nativePushToken(androidChannelName: string): Promise<string | null> {
  void androidChannelName;
  return null;
}

export function onPushOpened(listener: (url: string) => void): () => void {
  void listener;
  return () => undefined;
}
