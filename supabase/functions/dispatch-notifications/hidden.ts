// BL-32 (ADR-0008, section 16, item 8): with `push_hide_content` on, the lock screen shows the same
// neutral title and body for every type, in the profile's language: no task, time, actor or count.
// The tap still opens the right place (`url`) and a newer delivery still replaces the older (`tag`).
// Both the Web Push and the native message are built from this payload. No runtime imports, so Node
// tests it against the real JSON.
import type { PushPayload } from '../../../packages/contracts/src/notifications.ts';
import type { Translate } from './translate.ts';

export function withHiddenContent(payload: PushPayload, hide: boolean, t: Translate): PushPayload {
  if (!hide) return payload;
  return { ...payload, title: t('push.hidden.title'), body: t('push.hidden.body') };
}
