// One item of `claim_notification_batch`, validated before anything is sent. Deno only (zod and the
// contracts through deno.json). A subscription says its kind (ADR-0012, section 11): a device of the
// app never makes the browsers of the same user fail, nor the other way round.
import {
  dailySummarySourceSchema,
  deliveryChannelSchema,
  expoPushTokenSchema,
  notificationItemSchema,
  occurrenceStatusSchema,
  phoneE164Schema,
} from '@azkaban/contracts';
import { z } from 'zod';
import type { OutboundMessage } from './dispatch.ts';

const subscriptionSchema = z.discriminatedUnion('kind', [
  z.object({
    id: z.guid(),
    kind: z.literal('web'),
    endpoint: z.string(),
    p256dh: z.string(),
    auth: z.string(),
  }),
  z.object({ id: z.guid(), kind: z.literal('expo'), expoToken: expoPushTokenSchema }),
]);

const itemSchema = z.object({
  outboxId: z.guid(),
  notificationId: z.guid(),
  channel: deliveryChannelSchema,
  type: z.string(),
  data: z.record(z.string(), z.unknown()),
  occurrenceId: z.guid().nullable(),
  locale: z.string(),
  taskTitle: z.string().nullable(),
  requiresPhotoProof: z.boolean(),
  attempts: z.int().min(1),
  scheduledFor: z.string(),
  subscriptions: z.array(subscriptionSchema),
  timezone: z.string(),
  overdueAt: z.string().nullable(),
  occurrenceStatus: occurrenceStatusSchema.nullable(),
  phone: phoneE164Schema.nullable(),
  summary: dailySummarySourceSchema.nullable(),
});

/** The item, with its type and data checked against the contract of the bell, or its id to fail it. */
export function parseItem(raw: unknown): OutboundMessage | { invalid: string | null } {
  const item = itemSchema.safeParse(raw);
  if (!item.success) {
    const id = z.object({ outboxId: z.guid() }).safeParse(raw);
    return { invalid: id.success ? id.data.outboxId : null };
  }
  const source = notificationItemSchema.safeParse({
    id: item.data.notificationId,
    type: item.data.type,
    data: item.data.data,
    occurrenceId: item.data.occurrenceId,
    taskTitle: item.data.taskTitle,
    createdAt: item.data.scheduledFor,
    readAt: null,
  });
  // WhatsApp needs the number, and the summary its source: the claim sends both, or the row is broken.
  const complete =
    item.data.channel !== 'whatsapp' ||
    (item.data.phone !== null &&
      (item.data.type !== 'daily_summary' || item.data.summary !== null));
  return source.success && complete ? item.data : { invalid: item.data.outboxId };
}
