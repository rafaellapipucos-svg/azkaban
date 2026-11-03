// Integration check of the dispatch against the local stack (ADR-0008, section 6):
//
//   cp supabase/functions/.env.example supabase/functions/.env     # before `pnpm db:start`
//   pnpm db:start
//   pnpm functions:test
//
// Two parts. The deployed function is called over HTTP for what does not need keys: the cron secret,
// and, with the VAPID secrets empty as in .env.example, that the push waits while the daily summary
// goes out by WhatsApp through the ConsoleProvider (ADR-0009, section 2). The Web Push loop itself
// (claim, Web Push, report) runs here in Node against the real database functions, with a fake
// `fetch` standing in for every push service: no request leaves this machine, and the VAPID pair and
// the browser keys are made in memory for this run.
//
// The claim takes every due row of the database, so each case looks only at its own rows. The keys
// below are the universal demo keys of every local Supabase stack, not secrets.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { apiUrl as API } from '../_shared/local-stack.mjs';
import { runDispatch, type Batch, type OutboundMessage, type Report } from './dispatch.ts';
import { browser, decrypt, vapidPair, type Browser } from './test-kit.ts';
import { loadVapid, toBase64Url, WebPushChannel, type VapidKeys } from './web-push.ts';

const SERVICE =
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';
const CRON_SECRET = process.env.CRON_SECRET ?? 'local-demo-cron-secret';
const FUNCTION_URL = `${API}/functions/v1/dispatch-notifications`;

// Mirrors packages/config notificationDefaults and notificationRules (Node cannot import them).
const defaults = { batch: 100, lease: 120, maxDelayHours: 24 };
const retry = { maxAttempts: 5, baseDelaySeconds: 60, maxDelaySeconds: 3600 };
const hosts = [
  'fcm.googleapis.com',
  'updates.push.services.mozilla.com',
  'web.push.apple.com',
  'notify.windows.com',
];

const options = { auth: { persistSession: false, autoRefreshToken: false } };
const admin: SupabaseClient = createClient(API, SERVICE, options);

const ok = <T>(result: { data: T; error: unknown }): T => {
  assert.ifError(result.error);
  return result.data;
};

/** What the fake push service answers for an endpoint id. */
type Answer = number | 'network' | { status: number; retryAfter: string };
type Delivered = { endpoint: string; payload: { notificationId: string; title: string } };

describe('dispatch-notifications', () => {
  let userId: string;
  let contextId: string;
  let occurrenceId: string;
  let vapid: VapidKeys;
  const keys = new Map<string, Browser>();

  before(async () => {
    const { data, error } = await admin.auth.admin.createUser({
      email: `dispatch-${randomUUID()}@example.com`,
      password: randomUUID(),
      email_confirm: true,
    });
    assert.ifError(error);
    userId = data.user!.id;
    // No quiet hours, so the outcome does not depend on the hour the suite runs.
    ok(
      await admin
        .from('profiles')
        .update({ quiet_hours_start: null, quiet_hours_end: null })
        .eq('id', userId),
    );
    const area = ok(await admin.from('areas').select('id').limit(1).single());
    contextId = ok(
      await admin
        .from('contexts')
        .insert({
          area_id: area.id,
          owner_user_id: userId,
          name: 'p',
          color_token: 'x',
          icon: 'x',
          created_by: userId,
        })
        .select('id')
        .single(),
    ).id as string;
    const task = ok(
      await admin
        .from('tasks')
        .insert({
          context_id: contextId,
          created_by: userId,
          assignee_id: userId,
          title: 'Academia',
          schedule_type: 'timed',
          start_at: new Date(Date.now() + 2 * 3_600_000).toISOString(),
          duration_min: 30,
          timezone: 'UTC',
          rrule: null,
          exdates: [],
          // No reminders: the sweep of the cron adds nothing behind the tests' back.
          reminders: [],
          requires_photo_proof: false,
          requires_admin_approval: false,
          requires_partial_reason: false,
          difficulty: 'easy',
          priority: 'normal',
          visibility: 'private',
        })
        .select('id')
        .single(),
    );
    occurrenceId = ok(
      await admin.from('task_occurrences').select('id').eq('task_id', task.id).single(),
    ).id as string;
    const pair = await vapidPair();
    vapid = (await loadVapid(pair.d, pair.publicKey, 'mailto:ops@example.com'))!;
  });

  after(async () => {
    if (contextId) await admin.from('contexts').delete().eq('id', contextId);
    if (userId) await admin.auth.admin.deleteUser(userId);
  });

  /** A due reminder with its web_push outbox row, as enqueue_notification writes them. */
  async function enqueue(attempts = 0): Promise<{ notificationId: string; outboxId: string }> {
    const anchorAt = new Date(Date.now() + 2 * 3_600_000).toISOString();
    const notification = ok(
      await admin
        .from('notifications')
        .insert({
          user_id: userId,
          type: 'task_reminder',
          occurrence_id: occurrenceId,
          data: { leadMinutes: 120, anchorAt },
          dedupe_key: `task_reminder:test-${randomUUID()}`,
        })
        .select('id')
        .single(),
    );
    const now = new Date().toISOString();
    const outbox = ok(
      await admin
        .from('notification_outbox')
        .insert({
          notification_id: notification.id,
          user_id: userId,
          channel: 'web_push',
          scheduled_for: now,
          next_attempt_at: now,
          attempts,
        })
        .select('id')
        .single(),
    );
    return { notificationId: notification.id as string, outboxId: outbox.id as string };
  }

  /** Straight into the table: the RPC would refuse a host off the list, and one case needs that. */
  async function subscribe(name: string, host = 'fcm.googleapis.com'): Promise<string> {
    const ua = await browser();
    keys.set(name, ua);
    return ok(
      await admin
        .from('push_subscriptions')
        .insert({
          user_id: userId,
          endpoint: `https://${host}/fcm/send/${name}-${randomUUID()}`,
          p256dh: toBase64Url(ua.publicKey),
          auth: toBase64Url(ua.auth),
        })
        .select('id')
        .single(),
    ).id as string;
  }

  const outbox = async (id: string) =>
    ok(
      await admin
        .from('notification_outbox')
        .select('status, attempts, last_error, sent_at, next_attempt_at, locked_until')
        .eq('id', id)
        .single(),
    );
  const subscriptions = async () =>
    ok(await admin.from('push_subscriptions').select('id, last_success_at').eq('user_id', userId));
  const clearSubscriptions = async () =>
    ok(await admin.from('push_subscriptions').delete().eq('user_id', userId));

  /**
   * One run of the loop with the fake push service. `answers` is by the name in the endpoint; any
   * other endpoint (a row of someone else's) gets 201.
   */
  async function dispatch(answers: Record<string, Answer>, lease = defaults.lease) {
    const delivered: Delivered[] = [];
    const fake = (async (url: string, init: RequestInit) => {
      const name = new URL(url).pathname.split('/').at(-1)!.split('-')[0]!;
      const answer = answers[name] ?? 201;
      if (answer === 'network') throw new TypeError('fetch failed');
      const ua = keys.get(name);
      if (ua) {
        const { text } = await decrypt(init.body as Uint8Array, ua);
        delivered.push({ endpoint: name, payload: JSON.parse(text) });
      }
      return typeof answer === 'number'
        ? new Response(null, { status: answer })
        : new Response(null, {
            status: answer.status,
            headers: { 'retry-after': answer.retryAfter },
          });
    }) as typeof fetch;
    const totals = await runDispatch({
      claim: async (): Promise<Batch> => {
        const data = ok(
          await admin.rpc('claim_notification_batch', {
            p_limit: defaults.batch,
            p_lease_seconds: lease,
            p_max_delay_hours: defaults.maxDelayHours,
            p_channels: ['web_push'],
          }),
        ) as Omit<Batch, 'messages' | 'invalid'> & { items: OutboundMessage[] };
        return { ...data, messages: data.items, invalid: [] };
      },
      report: async (reports: Report[]) =>
        ok(await admin.rpc('report_notification_results', { p_results: reports })),
      channels: [
        new WebPushChannel({
          vapid,
          hosts,
          render: (m) => JSON.stringify({ notificationId: m.notificationId, title: m.taskTitle }),
          ttl: { pushTtlSeconds: 86_400, minPushTtlSeconds: 60 },
          fetch: fake,
          timeoutMs: 5000,
        }),
      ],
      batchSize: defaults.batch,
      budgetMs: 20_000,
      retry,
      concurrency: 10,
    });
    return { delivered, totals };
  }

  const secondsUntil = (instant: string) => (Date.parse(instant) - Date.now()) / 1000;

  test('only the cron secret opens it, and only POST', async () => {
    const call = (headers: Record<string, string>) =>
      fetch(FUNCTION_URL, { method: 'POST', headers, body: '{}' });
    for (const headers of [{}, { 'x-cron-secret': `${CRON_SECRET}x` }, { 'x-cron-secret': '' }]) {
      const res = await call(headers);
      assert.equal(res.status, 401);
      assert.deepEqual(await res.json(), { error: 'unauthorized' });
    }
    assert.equal((await fetch(FUNCTION_URL, { method: 'GET' })).status, 405);
  });

  test('without the VAPID secrets the push waits, and the daily summary goes out by WhatsApp', async () => {
    await clearSubscriptions();
    // A host off the list, so even a function with keys sends nothing out of this machine.
    await subscribe('idle', 'push.example.com');
    const push = await enqueue();

    // A profile ready for WhatsApp, with one task today, and its summary as the job enqueues it.
    const phone = `+55119${String(Math.floor(Math.random() * 1e8)).padStart(8, '0')}`;
    const now = new Date().toISOString();
    ok(
      await admin
        .from('profiles')
        .update({
          phone_e164: phone,
          phone_verified_at: now,
          whatsapp_opt_in_at: now,
          whatsapp_opt_in_version: 1,
          // Off for the job, so the cron adds no summary of its own if the suite runs near 8h.
          daily_summary_enabled: false,
        })
        .eq('id', userId),
    );
    const today = ok(
      await admin
        .from('tasks')
        .insert({
          context_id: contextId,
          created_by: userId,
          assignee_id: userId,
          title: 'Relatório do resumo',
          schedule_type: 'timed',
          // Now: today in any zone, and overdue only at the end of the local day.
          start_at: now,
          duration_min: 30,
          timezone: 'UTC',
          rrule: null,
          exdates: [],
          reminders: [],
          requires_photo_proof: false,
          requires_admin_approval: false,
          requires_partial_reason: false,
          difficulty: 'easy',
          priority: 'normal',
          visibility: 'private',
        })
        .select('id')
        .single(),
    );
    const notificationId = ok(
      await admin.rpc('enqueue_notification', {
        p_user: userId,
        p_type: 'daily_summary',
        p_occurrence_id: null,
        p_group_id: null,
        p_data: { localDate: now.slice(0, 10) },
        p_event_key: `test-${randomUUID()}`,
      }),
    ) as string;
    const rows = ok(
      await admin
        .from('notification_outbox')
        .select('id, channel')
        .eq('notification_id', notificationId),
    );
    assert.deepEqual(
      rows.map((r) => r.channel),
      ['whatsapp'],
    );
    const summaryId = rows[0]!.id as string;

    const res = await fetch(FUNCTION_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-cron-secret': CRON_SECRET },
      body: '{}',
    });
    const body = await res.json();
    assert.equal(res.status, 200, JSON.stringify(body));

    const pushAfter = await outbox(push.outboxId);
    if (pushAfter.status === 'pending') {
      // The push was not claimed: no attempt spent, no error.
      assert.equal(pushAfter.attempts, 0);
      assert.equal(pushAfter.last_error, null);
    } else {
      // Someone filled the VAPID secrets of supabase/functions/.env: then this checks the wiring of
      // the deployed function instead (zod, buildPushPayload, the i18n file, the host check).
      assert.equal(pushAfter.status, 'failed', JSON.stringify(body));
      assert.equal(pushAfter.last_error, 'push_endpoint_not_allowed');
    }

    const summaryAfter = await outbox(summaryId);
    assert.equal(summaryAfter.status, 'sent', JSON.stringify(summaryAfter));
    const line = ok(
      await admin
        .from('whatsapp_messages')
        .select('user_id, purpose, template, provider, provider_message_id, status')
        .eq('outbox_id', summaryId),
    );
    assert.equal(line.length, 1);
    assert.equal(line[0]!.user_id, userId);
    assert.equal(line[0]!.purpose, 'notification');
    assert.equal(line[0]!.template, 'daily_summary_v1');
    assert.equal(line[0]!.provider, 'console');
    assert.match(line[0]!.provider_message_id as string, /^console\./);

    const sent = ok(
      await admin.from('whatsapp_console_messages').select('message').eq('to_e164', phone),
    ).map((r) => r.message);
    assert.equal(sent.length, 1);
    assert.equal(sent[0].kind, 'template');
    assert.equal(sent[0].template, 'daily_summary_v1');
    assert.equal(sent[0].language, 'pt_BR');
    assert.deepEqual(Object.keys(sent[0].params).sort(), [
      'date',
      'deadlines',
      'footer',
      'overdue',
      'today',
    ]);
    assert.match(sent[0].params.today, /Relatório do resumo/);

    ok(
      await admin
        .from('notification_outbox')
        .update({ status: 'cancelled' })
        .eq('id', push.outboxId),
    );
    ok(await admin.from('tasks').delete().eq('id', today.id));
  });

  test('each answer of the push service leaves the outbox and the subscription as ADR-0008 says', async () => {
    type Case = {
      answer: Answer;
      status: string;
      code: string | null;
      kept: boolean;
      /** Seconds until the next attempt, for a retry. */
      wait?: number;
    };
    const cases: Record<string, Case> = {
      ok: { answer: 201, status: 'sent', code: null, kept: true },
      notfound: { answer: 404, status: 'failed', code: 'push_gone', kept: false },
      gone: { answer: 410, status: 'failed', code: 'push_gone', kept: false },
      forbidden: { answer: 403, status: 'failed', code: 'push_forbidden', kept: true },
      toolarge: { answer: 413, status: 'failed', code: 'push_too_large', kept: true },
      limited: {
        answer: { status: 429, retryAfter: '300' },
        status: 'pending',
        code: 'push_rate_limited',
        kept: true,
        wait: 300,
      },
      broken: { answer: 500, status: 'pending', code: 'push_server_error', kept: true, wait: 60 },
      offline: { answer: 'network', status: 'pending', code: 'push_network', kept: true, wait: 60 },
    };
    for (const [name, expected] of Object.entries(cases)) {
      await clearSubscriptions();
      const subscriptionId = await subscribe(name);
      const row = await enqueue();
      const { delivered } = await dispatch({ [name]: expected.answer });
      const after = await outbox(row.outboxId);
      assert.equal(after.status, expected.status, name);
      assert.equal(after.last_error, expected.code, name);
      assert.equal(after.attempts, 1, name);
      assert.equal(after.locked_until, null, name);
      assert.equal(after.sent_at !== null, expected.status === 'sent', name);
      const left = await subscriptions();
      assert.equal(
        left.some((s) => s.id === subscriptionId),
        expected.kept,
        `${name}: subscription kept`,
      );
      if (expected.status === 'sent') {
        assert.ok(left[0]!.last_success_at, `${name}: last_success_at`);
        assert.deepEqual(delivered, [
          { endpoint: name, payload: { notificationId: row.notificationId, title: 'Academia' } },
        ]);
      }
      if (expected.wait !== undefined) {
        const wait = secondsUntil(after.next_attempt_at as string);
        assert.ok(Math.abs(wait - expected.wait) < 10, `${name}: waits ${wait}`);
        // Out of the way of the next cases.
        ok(
          await admin
            .from('notification_outbox')
            .update({ status: 'cancelled' })
            .eq('id', row.outboxId),
        );
      }
    }
  });

  test('two subscriptions, one dead and one alive: sent, and only the dead one is deleted', async () => {
    await clearSubscriptions();
    const dead = await subscribe('dead');
    const alive = await subscribe('alive');
    const row = await enqueue();
    const { delivered } = await dispatch({ dead: 410, alive: 201 });
    assert.equal((await outbox(row.outboxId)).status, 'sent');
    const left = await subscriptions();
    assert.deepEqual(
      left.map((s) => s.id),
      [alive],
    );
    assert.ok(left[0]!.last_success_at);
    assert.ok(!left.some((s) => s.id === dead));
    assert.deepEqual(delivered.map((d) => d.endpoint).sort(), ['alive', 'dead']);
  });

  test('a host off the list is checked again by the function, never requested, and kept', async () => {
    await clearSubscriptions();
    const stray = await subscribe('stray', 'push.example.com');
    const row = await enqueue();
    const { delivered } = await dispatch({});
    const after = await outbox(row.outboxId);
    assert.equal(after.status, 'failed');
    assert.equal(after.last_error, 'push_endpoint_not_allowed');
    assert.deepEqual(delivered, []);
    assert.deepEqual(
      (await subscriptions()).map((s) => s.id),
      [stray],
    );
  });

  test('a transient failure at the last attempt is failed, not retried', async () => {
    await clearSubscriptions();
    await subscribe('last');
    const row = await enqueue(retry.maxAttempts - 1);
    await dispatch({ last: 503 });
    const after = await outbox(row.outboxId);
    assert.equal(after.status, 'failed');
    assert.equal(after.attempts, retry.maxAttempts);
    assert.equal(after.last_error, 'push_server_error');
  });

  test('a run that dies between sending and reporting sends again after the lease, once', async () => {
    await clearSubscriptions();
    await subscribe('lease');
    const row = await enqueue();
    // The dead run: claimed with a short lease, and never reported.
    ok(
      await admin.rpc('claim_notification_batch', {
        p_limit: defaults.batch,
        p_lease_seconds: 2,
        p_max_delay_hours: defaults.maxDelayHours,
        p_channels: ['web_push'],
      }),
    );
    assert.equal((await outbox(row.outboxId)).status, 'sending');
    // Inside the lease nobody takes it.
    assert.deepEqual((await dispatch({})).delivered, []);
    await new Promise((resolve) => setTimeout(resolve, 2500));
    const { delivered } = await dispatch({});
    const after = await outbox(row.outboxId);
    assert.equal(after.status, 'sent');
    assert.equal(after.attempts, 2);
    // Same notification id, which is the tag: the browser shows one.
    assert.deepEqual(
      delivered.map((d) => d.payload.notificationId),
      [row.notificationId],
    );
  });

  test('a row already sent is not sent again, and a late report does not change it', async () => {
    await clearSubscriptions();
    await subscribe('once');
    const row = await enqueue();
    assert.equal((await dispatch({})).delivered.length, 1);
    const sent = await outbox(row.outboxId);
    assert.equal(sent.status, 'sent');
    const late = ok(
      await admin.rpc('report_notification_results', {
        p_results: [
          { outboxId: row.outboxId, status: 'retry', code: 'late', retryAfterSeconds: 1 },
        ],
      }),
    );
    assert.equal(late, 0);
    assert.deepEqual(await outbox(row.outboxId), sent);
    assert.deepEqual((await dispatch({})).delivered, []);
  });
});
