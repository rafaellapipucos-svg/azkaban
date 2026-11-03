import type { PushPermission, PushSupport } from '@azkaban/platform';

type OfferInput = {
  vapidPublicKey: string | undefined;
  support: PushSupport;
  permission: PushPermission;
  /** This device already showed the step, to anyone. */
  offered: boolean;
  /** The current account already gets push on this device. */
  enabledHere: boolean;
};

/**
 * Whether to show the push step after signing in (ADR-0012, section 13, item 2): once per device, and
 * only when there is something to do. An iPhone in Safari counts: the step teaches the Home Screen.
 */
export function shouldOfferPushSetup(input: OfferInput): boolean {
  if (!input.vapidPublicKey || input.offered || input.enabledHere) return false;
  if (input.support !== 'supported' && input.support !== 'needs_install') return false;
  return input.permission !== 'denied';
}
