import { z } from 'zod';
import { idSchema, instantSchema, localDateSchema } from './common';

// Notifications (ADR-0008). A notification is one row of the bell, written by the database for any
// path that causes it. The channels below are the ones that ring outside the app, each through one
// outbox row; the bell itself is not a channel and is always on.

export const notificationTypeSchema = z.enum([
  /** To the assignee, before or at the time, for each lead in `tasks.reminders`. */
  'task_reminder',
  /** To the assignee, when someone else or the job turned the occurrence red. */
  'occurrence_missed',
  /** To the creator, when someone else resolved a task they created. */
  'occurrence_resolved',
  /** To whoever has `proof.review` in the group, except the author: a photo waits for review. */
  'proof_in_review',
  /** To the author, when a reviewer disputed the photo. */
  'proof_disputed',
  /**
   * To a profile ready for WhatsApp, at its chosen time (ADR-0009, section 5). Only by WhatsApp; the
   * bell row is born read.
   */
  'daily_summary',
]);
export type NotificationType = z.infer<typeof notificationTypeSchema>;

/** `whatsapp` exists from now so Phase 5 adds an implementation, not a migration of the enum. */
export const deliveryChannelSchema = z.enum(['web_push', 'whatsapp']);
export type DeliveryChannel = z.infer<typeof deliveryChannelSchema>;

/** Row of `notification_preferences`. No row means `notificationRules.defaultChannels`. */
export const notificationPreferenceSchema = z.object({
  type: notificationTypeSchema,
  channel: deliveryChannelSchema,
  enabled: z.boolean(),
});
export type NotificationPreference = z.infer<typeof notificationPreferenceSchema>;

/** `HH:mm`, local time of the profile. Postgres answers `22:00:00`; `packages/data` cuts it. */
export const localTimeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);

/**
 * Columns `quiet_hours_start` and `quiet_hours_end` of `profiles`, in the profile's time zone. Null
 * means no quiet hours. A window may cross midnight, as 22:00 to 07:00, and cannot be empty.
 */
export const quietHoursSchema = z
  .object({ start: localTimeSchema, end: localTimeSchema })
  .refine(({ start, end }) => start !== end, { path: ['end'] })
  .nullable();
export type QuietHours = z.infer<typeof quietHoursSchema>;

// What each type keeps in `notifications.data`: references and the facts of the moment, never a
// title, a note or a reason. The bell reads those through RLS, so an ex-member sees a generic line.
const reminderData = z.object({
  leadMinutes: z.int().min(0).max(43200),
  /** The instant the reminder is about: the start, or the due moment of a `deadline`. */
  anchorAt: instantSchema,
});
const missedData = z.object({
  /** Null when the job did it. */
  byUserId: idSchema.nullable(),
});
const resolvedData = z.object({
  status: z.enum(['done', 'partial', 'missed']),
  byUserId: idSchema,
});
const inReviewData = z.object({ proofId: idSchema, groupId: idSchema });
const disputedData = z.object({ proofId: idSchema, toStatus: z.enum(['partial', 'missed']) });
/**
 * `notifications.data` of `daily_summary`. The content is read at send time; the row only marks the
 * day. Here and not in `./whatsapp`, which imports this file: a cycle would leave one side undefined.
 */
export const dailySummaryNotificationDataSchema = z.object({ localDate: localDateSchema });

const item = {
  id: idSchema,
  /** Null when the occurrence is gone. */
  occurrenceId: idSchema.nullable(),
  createdAt: instantSchema,
  readAt: instantSchema.nullable(),
  /** From an embed that follows the RLS of the task: null when the user no longer sees it. */
  taskTitle: z.string().nullable(),
};

/** One line of the bell, and the row Realtime delivers on insert, after mapping. */
export const notificationItemSchema = z.discriminatedUnion('type', [
  z.object({ ...item, type: z.literal('task_reminder'), data: reminderData }),
  z.object({ ...item, type: z.literal('occurrence_missed'), data: missedData }),
  z.object({ ...item, type: z.literal('occurrence_resolved'), data: resolvedData }),
  z.object({ ...item, type: z.literal('proof_in_review'), data: inReviewData }),
  z.object({ ...item, type: z.literal('proof_disputed'), data: disputedData }),
  z.object({ ...item, type: z.literal('daily_summary'), data: dailySummaryNotificationDataSchema }),
]);
export type NotificationItem = z.infer<typeof notificationItemSchema>;

// base64url, as `PushSubscription.toJSON()` gives it. Padding is tolerated, since the spec does not
// forbid it.
const base64url = (bytes: number) =>
  z.string().regex(new RegExp(`^[A-Za-z0-9_-]{${Math.ceil((bytes * 4) / 3)}}=*$`));

/** Argument of the `register_push_subscription` RPC: `PushSubscription.toJSON()` and a label. */
export const pushSubscriptionInputSchema = z.object({
  /** A capability: whoever holds it with the keys can push to this browser. Never logged. */
  endpoint: z.url({ protocol: /^https$/ }).max(1024),
  keys: z.object({ p256dh: base64url(65), auth: base64url(16) }),
  /** Shown in the list of devices, to tell them apart. */
  userAgent: z.string().trim().max(256).nullable(),
});
export type PushSubscriptionInput = z.infer<typeof pushSubscriptionInputSchema>;

/** What the user reads of a subscription. The endpoint and the keys stay in the database. */
export const pushDeviceSchema = z.object({
  id: idSchema,
  userAgent: z.string().nullable(),
  createdAt: instantSchema,
  lastSuccessAt: instantSchema.nullable(),
});
export type PushDevice = z.infer<typeof pushDeviceSchema>;

/**
 * RFC 8291 encrypts a record of at most 4096 bytes. What is left after the header, the key and the
 * tag is about 3990; this keeps a margin and a size the service worker can trust.
 */
export const pushPayloadMaxBytes = 3072;

/**
 * A path of the app, never another origin. `safeInternalPath` in core uses it, and `sw.js` repeats it
 * (ADR-0008, section 17). No backslash and no control character: the URL parser drops tab, LF and CR
 * anywhere, so `"/\t/evil.com"` would resolve to `https://evil.com/`.
 */
export const internalPathSchema = z
  .string()
  .max(200)
  .regex(/^\/[^/\\\p{Cc}][^\\\p{Cc}]*$/u);

/** Decrypted body of a Web Push, read by `sw.js`. The text is rendered by the server in the user's locale. */
export const pushPayloadSchema = z.object({
  v: z.literal(1),
  notificationId: idSchema,
  type: notificationTypeSchema,
  title: z.string().min(1).max(120),
  body: z.string().max(300),
  /** Opened on tap. A task with photo proof goes straight to the camera. */
  url: internalPathSchema,
  /** A newer notification with the same tag replaces the older one on screen. */
  tag: z.string().min(1).max(64),
});
export type PushPayload = z.infer<typeof pushPayloadSchema>;

/** Raised by `register_push_subscription`. Any other message is the generic failure. */
export const notificationErrorCodeSchema = z.enum([
  /** A push service outside `notificationRules.pushEndpointHosts`: this browser cannot be used. */
  'push_endpoint_not_allowed',
]);
export type NotificationErrorCode = z.infer<typeof notificationErrorCodeSchema>;
