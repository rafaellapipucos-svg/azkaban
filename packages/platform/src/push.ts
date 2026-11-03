/**
 * Web Push (ADR-0008, section 9). The browser does it, in `push.web.ts`. `push.native.ts` has no Web
 * Push either: it only adds the Expo token and the tap on a notification (ADR-0012, section 11).
 */

/**
 * - `supported`: can ask and subscribe.
 * - `needs_install`: iPhone or iPad in Safari: add to the Home Screen and open from the icon.
 * - `ios_too_old`: iOS before 16.4 has no Web Push at all.
 * - `unsupported`: this browser or platform cannot receive.
 */
export type PushSupport = 'supported' | 'needs_install' | 'ios_too_old' | 'unsupported';
export type PushPermission = 'default' | 'granted' | 'denied';

/** Same shape as `PushSubscriptionInput` in the contracts: this package does not depend on them. */
export type PushSubscriptionData = {
  endpoint: string;
  keys: { p256dh: string; auth: string };
  userAgent: string | null;
};

/** `id` is the one every message names; `name` is what Android settings show, already translated. */
export type AndroidPushChannel = { id: string; name: string };

/** Same shape as `NativePushSubscriptionInput`: the Expo token, unchecked here, and a label. */
export type NativePushTokenData = { token: string; userAgent: string | null };

export function pushSupport(): PushSupport {
  return 'unsupported';
}

export function pushPermission(): PushPermission {
  return 'denied';
}

/** Asks for the permission, so call it only from a tap. Null when the person did not allow it. */
export async function subscribePush(vapidPublicKey: string): Promise<PushSubscriptionData | null> {
  void vapidPublicKey;
  return null;
}

/** The subscription this browser already has, renewed if the key changed. Never asks. */
export async function currentPushSubscription(
  vapidPublicKey: string,
): Promise<PushSubscriptionData | null> {
  void vapidPublicKey;
  return null;
}

export async function unsubscribePush(): Promise<void> {}

/**
 * Native only, behind `features.nativePush`: the Expo push token of this device, asking for the
 * permission, so call it only from a tap. Null without the flag, the EAS project id or the permission,
 * and on web, where it asks nothing. With the flag on, `pushSupport` says whether it can work.
 */
export async function nativePushToken(
  channel: AndroidPushChannel,
): Promise<NativePushTokenData | null> {
  void channel;
  return null;
}

/**
 * Native only: calls `listener` with the `url` of a notification the person tapped, also the one that
 * opened the app. Untrusted: check it with `safeInternalPath`. On web, `sw.js` opens it. Returns the stop.
 */
export function onPushOpened(listener: (url: string) => void): () => void {
  void listener;
  return () => undefined;
}
