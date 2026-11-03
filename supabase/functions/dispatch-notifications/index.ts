// Sends the outbox of notifications (ADR-0008, section 6). Called every minute by the cron job
// `dispatch-notifications` with `x-cron-secret`, like proof-retention. The database decides who gets
// what (claim_notification_batch) and records what happened (report_notification_results); this
// function only renders and sends. Logs carry counts and codes, never an endpoint, a key, a title, a
// phone, a user id or a payload. Each run claims only the channels it can send (ADR-0009, section 2):
// without the VAPID secrets the push waits and WhatsApp goes on. The devices of the app ride the push
// row (ADR-0012, section 11) through NativePushChannel: a fake Expo unless NATIVE_PUSH_PROVIDER=expo.
import { notificationDefaults, notificationRules } from '@azkaban/config';
import {
  nativePushAndroidChannelId,
  nativePushMessageSchema,
  whatsappOutboundSchema,
  type NativePushMessage,
  type NotificationItem,
  type PushPayload,
  type WhatsAppOutbound,
} from '@azkaban/contracts';
import { buildPushPayload, type PushSource } from '@azkaban/core';
import { z } from 'zod';
import { defaults } from '../../../packages/config/src/defaults.ts';
import { taskRules } from '../../../packages/config/src/tasks.ts';
import { whatsappDefaults } from '../../../packages/config/src/whatsapp.ts';
import { buildDailySummary } from '../../../packages/core/src/notifications/whatsapp.ts';
import ptBR from '../../../packages/i18n/src/pt-BR/notifications.json' with { type: 'json' };
import { responder, sameSecret, serviceClient } from '../_shared/http.ts';
import { whatsappEnv, whatsappProvider } from '../_shared/whatsapp/runtime.ts';
import {
  runDispatch,
  WhatsAppChannel,
  type Batch,
  type NotificationChannel,
  type OutboundMessage,
  type Report,
} from './dispatch.ts';
import { parseItem } from './items.ts';
import { NativePushChannel, nativePushTransport } from './native-push.ts';
import { makeTranslate, type Messages, type Translate } from './translate.ts';
import { loadVapid, ttlSeconds, WebPushChannel } from './web-push.ts';

/** One file per language of packages/i18n. A profile in a language without one gets the default. */
const messages: Record<string, Messages> = { 'pt-BR': ptBR as Messages };
// Sends at the same time, and how long one push service may take before it is a retry.
const CONCURRENCY = 10;
const SEND_TIMEOUT_MS = 10_000;

const reply = responder();

const claimSchema = z.object({
  items: z.array(z.unknown()),
  expired: z.int().min(0),
  cancelled: z.int().min(0),
  deferred: z.int().min(0),
});

/** The profile's language when there is a file for it, else the default. Also the one of Intl. */
const knownLocale = (locale: string) => (messages[locale] ? locale : defaults.locale);

const translators = new Map<string, Translate>();
function translatorFor(locale: string): Translate {
  const known = knownLocale(locale);
  let t = translators.get(known);
  if (!t) {
    t = makeTranslate(messages[known]!, known);
    translators.set(known, t);
  }
  return t;
}

/** The payload, validated by the contract inside buildPushPayload. Only the encrypted body carries it. */
function payload(message: OutboundMessage): PushPayload {
  const source = {
    id: message.notificationId,
    type: message.type as NotificationItem['type'],
    data: message.data,
    occurrenceId: message.occurrenceId,
    taskTitle: message.taskTitle,
    // An automatic red still in its late window says until when, in the profile's zone.
    timezone: message.timezone,
    overdueAt: message.overdueAt,
    occurrenceStatus: message.occurrenceStatus,
  } as PushSource;
  return buildPushPayload(source, message.requiresPhotoProof, translatorFor(message.locale), {
    locale: knownLocale(message.locale),
    lateCompletionWindowHours: taskRules.lateCompletionWindowHours,
    now: new Date(),
  });
}

const render = (message: OutboundMessage) => JSON.stringify(payload(message));

/** The same title, body and tap as the Web Push, for one device (ADR-0012, section 11). */
function renderNative(message: OutboundMessage, to: string): NativePushMessage {
  const { v, notificationId, type, url, title, body } = payload(message);
  return nativePushMessageSchema.parse({
    to,
    title,
    body,
    data: { v, notificationId, type, url },
    channelId: nativePushAndroidChannelId,
    ttl: ttlSeconds(message, Date.now(), notificationDefaults),
  });
}

const languages: Record<string, string> = whatsappDefaults.templateLanguages;
/** Meta's language of the template; a locale without one uses the first (ADR-0009, section 6). */
const templateLanguage = (locale: string) => languages[locale] ?? Object.values(languages)[0]!;

/**
 * The WhatsApp message of a claimed row. Only `daily_summary` goes by WhatsApp in this phase: the claim
 * cancels any other type, and one that slips through throws, which fails the row.
 */
function renderWhatsApp(message: OutboundMessage): WhatsAppOutbound {
  if (message.type !== 'daily_summary' || !message.summary || !message.phone) {
    throw new Error('whatsapp_type_not_allowed');
  }
  const locale = knownLocale(message.locale);
  return whatsappOutboundSchema.parse({
    kind: 'template',
    to: message.phone,
    template: whatsappDefaults.templates.dailySummary,
    language: templateLanguage(message.locale),
    params: buildDailySummary(
      message.summary,
      { locale, budgets: whatsappDefaults.summaryBudgets, now: new Date() },
      translatorFor(locale),
    ),
  });
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

    // Before any claim, the channels this run can send. Only those are claimed: a row claimed without
    // keys to send it would only wait for its lease. Without VAPID, the push rows stay pending, the
    // devices of the app included: they share the row.
    const admin = serviceClient();
    const channels: NotificationChannel[] = [];
    const vapid = await loadVapid(
      Deno.env.get('VAPID_PRIVATE_KEY'),
      Deno.env.get('VAPID_PUBLIC_KEY'),
      Deno.env.get('VAPID_SUBJECT'),
    );
    if (vapid) {
      const transport = nativePushTransport(
        {
          NATIVE_PUSH_PROVIDER: Deno.env.get('NATIVE_PUSH_PROVIDER'),
          EXPO_ACCESS_TOKEN: Deno.env.get('EXPO_ACCESS_TOKEN'),
        },
        fetch,
      );
      const native =
        transport &&
        new NativePushChannel({ ...transport, render: renderNative, timeoutMs: SEND_TIMEOUT_MS });
      channels.push(
        new WebPushChannel({
          vapid,
          hosts: notificationRules.pushEndpointHosts,
          render,
          ttl: notificationDefaults,
          fetch,
          timeoutMs: SEND_TIMEOUT_MS,
          native,
        }),
      );
    }
    const env = whatsappEnv();
    if (env) channels.push(new WhatsAppChannel(whatsappProvider(env, admin), renderWhatsApp));
    if (channels.length === 0) {
      console.error(JSON.stringify({ event: 'dispatch_failed', stage: 'channels' }));
      return reply(500, { error: 'channels_not_configured' });
    }

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
              p_channels: channels.map((c) => c.channel),
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
      channels,
      batchSize: notificationDefaults.dispatchBatchSize,
      budgetMs: notificationDefaults.dispatchBudgetMs,
      retry: notificationDefaults.retry,
      concurrency: CONCURRENCY,
    });

    console.log(
      JSON.stringify({
        event: 'dispatch_done',
        channels: channels.map((c) => c.channel),
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
