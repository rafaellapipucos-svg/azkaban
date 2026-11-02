// Sends the outbox of notifications (ADR-0008, section 6). Called every minute by the cron job
// `dispatch-notifications` with `x-cron-secret`, like proof-retention. The database decides who gets
// what (claim_notification_batch) and records what happened (report_notification_results); this
// function only renders and sends. Logs carry counts and codes, never an endpoint, a key, a title, a
// user id or a payload.
import { notificationDefaults, notificationRules } from '@azkaban/config';
import {
  deliveryChannelSchema,
  notificationItemSchema,
  type NotificationItem,
} from '@azkaban/contracts';
import { buildPushPayload, type PushSource } from '@azkaban/core';
import { z } from 'zod';
import { defaults } from '../../../packages/config/src/defaults.ts';
import ptBR from '../../../packages/i18n/src/pt-BR/notifications.json' with { type: 'json' };
import { responder, sameSecret, serviceClient } from '../_shared/http.ts';
import { runDispatch, type Batch, type OutboundMessage, type Report } from './dispatch.ts';
import { makeTranslate, type Messages, type Translate } from './translate.ts';
import { loadVapid, WebPushChannel } from './web-push.ts';

/** One file per language of packages/i18n. A profile in a language without one gets the default. */
const messages: Record<string, Messages> = { 'pt-BR': ptBR as Messages };
// Sends at the same time, and how long one push service may take before it is a retry.
const CONCURRENCY = 10;
const SEND_TIMEOUT_MS = 10_000;

const reply = responder();

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
  subscriptions: z.array(
    z.object({ id: z.guid(), endpoint: z.string(), p256dh: z.string(), auth: z.string() }),
  ),
});
const claimSchema = z.object({
  items: z.array(z.unknown()),
  expired: z.int().min(0),
  cancelled: z.int().min(0),
  deferred: z.int().min(0),
});

/** The item, with its type and data checked against the contract of the bell, or its id to fail it. */
function parseItem(raw: unknown): OutboundMessage | { invalid: string | null } {
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
  return source.success ? item.data : { invalid: item.data.outboxId };
}

const translators = new Map<string, Translate>();
function translatorFor(locale: string): Translate {
  const known = messages[locale] ? locale : defaults.locale;
  let t = translators.get(known);
  if (!t) {
    t = makeTranslate(messages[known]!, known);
    translators.set(known, t);
  }
  return t;
}

/** The payload, validated by the contract inside buildPushPayload. Only the encrypted body carries it. */
function render(message: OutboundMessage): string {
  const source = {
    id: message.notificationId,
    type: message.type as NotificationItem['type'],
    data: message.data,
    occurrenceId: message.occurrenceId,
    taskTitle: message.taskTitle,
  } as PushSource;
  return JSON.stringify(
    buildPushPayload(source, message.requiresPhotoProof, translatorFor(message.locale)),
  );
}

class DatabaseError extends Error {}
function check<T>(stage: string, result: { data: T; error: { code?: string } | null }): T {
  if (result.error) {
    console.error(JSON.stringify({ event: 'dispatch_failed', stage, code: result.error.code }));
    throw new DatabaseError(stage);
  }
  return result.data;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return reply(204, null);
  if (req.method !== 'POST') return reply(405, { error: 'method_not_allowed' });

  try {
    // Only the cron job calls this. A missing or wrong secret is refused the same.
    const given = req.headers.get('x-cron-secret');
    const expected = Deno.env.get('CRON_SECRET');
    if (given === null || !expected || !(await sameSecret(given, expected))) {
      return reply(401, { error: 'unauthorized' });
    }

    // Before any claim: a row claimed without keys to send it would only wait for its lease.
    const vapid = await loadVapid(
      Deno.env.get('VAPID_PRIVATE_KEY'),
      Deno.env.get('VAPID_PUBLIC_KEY'),
      Deno.env.get('VAPID_SUBJECT'),
    );
    if (!vapid) {
      console.error(JSON.stringify({ event: 'dispatch_failed', stage: 'vapid' }));
      return reply(500, { error: 'vapid_not_configured' });
    }

    const admin = serviceClient();
    const began = performance.now();
    const totals = await runDispatch({
      claim: async (): Promise<Batch> => {
        const claimed = claimSchema.safeParse(
          check(
            'claim',
            await admin.rpc('claim_notification_batch', {
              p_limit: notificationDefaults.dispatchBatchSize,
              p_lease_seconds: notificationDefaults.leaseSeconds,
              p_max_delay_hours: notificationDefaults.maxDelayHours,
            }),
          ),
        );
        if (!claimed.success) {
          console.error(JSON.stringify({ event: 'dispatch_failed', stage: 'claim_shape' }));
          throw new DatabaseError('claim_shape');
        }
        const batch: Batch = { ...claimed.data, messages: [], invalid: [] };
        let unreadable = 0;
        for (const raw of claimed.data.items) {
          const parsed = parseItem(raw);
          if (!('invalid' in parsed)) batch.messages.push(parsed);
          else if (parsed.invalid) batch.invalid.push(parsed.invalid);
          // Without an id it cannot be reported: its lease runs out, and maxDelayHours ends it.
          else unreadable += 1;
        }
        if (batch.invalid.length + unreadable > 0) {
          console.error(
            JSON.stringify({
              event: 'dispatch_invalid_items',
              invalid: batch.invalid.length,
              unreadable,
            }),
          );
        }
        return batch;
      },
      report: async (reports: Report[]) =>
        check('report', await admin.rpc('report_notification_results', { p_results: reports })),
      channels: [
        new WebPushChannel({
          vapid,
          hosts: notificationRules.pushEndpointHosts,
          render,
          ttl: notificationDefaults,
          fetch,
          timeoutMs: SEND_TIMEOUT_MS,
        }),
      ],
      batchSize: notificationDefaults.dispatchBatchSize,
      budgetMs: notificationDefaults.dispatchBudgetMs,
      retry: notificationDefaults.retry,
      concurrency: CONCURRENCY,
    });

    console.log(
      JSON.stringify({
        event: 'dispatch_done',
        ...totals,
        ms: Math.round(performance.now() - began),
      }),
    );
    return reply(200, totals);
  } catch (error) {
    if (!(error instanceof DatabaseError)) console.error(JSON.stringify({ event: 'unexpected' }));
    return reply(500, { error: 'internal' });
  }
});
