/**
 * Web Push (ADR-0008, section 9). The browser does it, in `push.web.ts`; native push comes with F8,
 * so here nothing is supported and nothing happens.
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
