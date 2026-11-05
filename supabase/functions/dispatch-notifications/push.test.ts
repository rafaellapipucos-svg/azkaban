// Unit tests of the Web Push pieces and the dispatch loop, in Node, with no stack and no network: the
// push service is a fake `fetch`. Keys are made by each test and live only in memory.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, test } from 'node:test';
import {
  backoffSeconds,
  runDispatch,
  toReport,
  type Batch,
  type OutboundMessage,
  type Report,
  type SendResult,
  WhatsAppChannel,
} from './dispatch.ts';
import type { WhatsAppProvider } from '../_shared/whatsapp/provider.ts';
import { withHiddenContent } from './hidden.ts';
import { makeTranslate, type Messages } from './translate.ts';
import {
  classify,
  combine,
  encrypt,
  endpointAllowed,
  fromBase64Url,
  importPrivateKey,
  loadVapid,
  retryAfterSeconds,
  toBase64Url,
  ttlSeconds,
  vapidAuthorization,
  WebPushChannel,
  type Ephemeral,
  type VapidKeys,
} from './web-push.ts';
import { browser, decrypt, vapidPair, type Browser } from './test-kit.ts';
import {
  classifyTicket,
  EXPO_PUSH_URL,
  fakeExpoFetch,
  NativePushChannel,
  nativePushTransport,
} from './native-push.ts';
import type {
  NativePushMessage,
  PushPayload,
} from '../../../packages/contracts/src/notifications.ts';

// Mirrors packages/config notificationDefaults and notificationRules, which Node cannot import
// (extensionless imports). The function passes the real ones.
const retry = { maxAttempts: 5, baseDelaySeconds: 60, maxDelaySeconds: 3600 };
const ttl = { pushTtlSeconds: 86_400, minPushTtlSeconds: 60 };
const hosts = [
  'fcm.googleapis.com',
  'updates.push.services.mozilla.com',
  'web.push.apple.com',
  'notify.windows.com',
];

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const messages = JSON.parse(
  readFileSync(
    new URL('../../../packages/i18n/src/pt-BR/notifications.json', import.meta.url),
    'utf8',
  ),
) as Messages;

describe('RFC 8291', () => {
  test('appendix A: the same input gives the same bytes', async () => {
    const b = fromBase64Url;
    const asPublic = b(
      'BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8',
    );
    const ephemeral: Ephemeral = {
      salt: b('DGv6ra1nlYgDCS1FRnbzlw'),
      privateKey: await importPrivateKey(
        b('yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw'),
        asPublic,
        'ECDH',
      ),
      publicKey: asPublic,
    };
    const result = await encrypt(
      encoder.encode('When I grow up, I want to be a watermelon'),
      b('BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4'),
      b('BTBZMqHH6r4Tts7J_aSIgg'),
      ephemeral,
    );
    assert.equal(
      toBase64Url(result),
      'DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN',
    );
  });

  test('a fresh message decrypts on the browser side, and two never share a salt', async () => {
    const ua = await browser();
    const { channel, requests } = await channelWith(
      async () => new Response(null, { status: 201 }),
    );
    const sent = await channel.send(message([subscription(ua, 'a')]));
    assert.deepEqual(sent, { kind: 'sent', delivered: ['a'], gone: [] });
    const [first] = requests;
    const { text, rs } = await decrypt(first!.body, ua);
    assert.equal(text, '{"hello":"Academia"}');
    assert.equal(rs, 4096);
    await channel.send(message([subscription(ua, 'a')]));
    assert.notDeepEqual(requests[1]!.body.subarray(0, 16), first!.body.subarray(0, 16));
  });
});

describe('VAPID', () => {
  test('the JWT is ES256 for the origin, at most 12 hours, verifiable with the public key', async () => {
    const pair = await vapidPair();
    const vapid = (await loadVapid(pair.d, pair.publicKey, 'mailto:ops@example.com'))!;
    const header = await vapidAuthorization('https://fcm.googleapis.com', vapid, 1_000_000);
    const match = /^vapid t=([^.]+)\.([^.]+)\.([^,]+), k=(.+)$/.exec(header);
    assert.ok(match);
    const [, head, claims, signature, k] = match;
    assert.equal(k, pair.publicKey);
    assert.deepEqual(JSON.parse(decoder.decode(fromBase64Url(head!))), {
      typ: 'JWT',
      alg: 'ES256',
    });
    assert.deepEqual(JSON.parse(decoder.decode(fromBase64Url(claims!))), {
      aud: 'https://fcm.googleapis.com',
      exp: 1_000_000 + 43_200,
      sub: 'mailto:ops@example.com',
    });
    const ok = await crypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' },
      pair.verifyKey,
      fromBase64Url(signature!),
      encoder.encode(`${head}.${claims}`),
    );
    assert.equal(ok, true);
  });

  test('missing or malformed secrets are not configured', async () => {
    const pair = await vapidPair();
    assert.equal(await loadVapid(undefined, pair.publicKey, 'mailto:a@b.c'), null);
    assert.equal(await loadVapid('', pair.publicKey, 'mailto:a@b.c'), null);
    assert.equal(await loadVapid(pair.d, '', 'mailto:a@b.c'), null);
    assert.equal(await loadVapid(pair.d, pair.publicKey, ''), null);
    assert.equal(await loadVapid(pair.d, pair.publicKey, 'ops@example.com'), null);
    assert.equal(await loadVapid('short', pair.publicKey, 'mailto:a@b.c'), null);
    assert.ok(await loadVapid(pair.d, pair.publicKey, 'https://example.com/contact'));
  });
});

describe('endpoint host', () => {
  test('only HTTPS to a listed host or its subdomain, on the default port, without credentials', () => {
    const allowed = [
      'https://fcm.googleapis.com/fcm/send/abc',
      'https://updates.push.services.mozilla.com/wpush/v2/abc',
      'https://web.push.apple.com/abc',
      'https://wns2-by3p.notify.windows.com/w/?token=abc',
    ];
    for (const url of allowed) assert.equal(endpointAllowed(url, hosts), true, url);
    const refused = [
      'http://fcm.googleapis.com/fcm/send/abc',
      'https://fcm.googleapis.com:8443/fcm/send/abc',
      'https://user:pass@fcm.googleapis.com/fcm/send/abc',
      'https://fcm.googleapis.com.evil.example/abc',
      'https://evilfcm.googleapis.com/abc',
      'https://googleapis.com/abc',
      'https://127.0.0.1/abc',
      'https://localhost/abc',
      'not a url',
      '',
    ];
    for (const url of refused) assert.equal(endpointAllowed(url, hosts), false, url);
  });

  test('a host off the list is never requested', async () => {
    const ua = await browser();
    const { channel, requests } = await channelWith(
      async () => new Response(null, { status: 201 }),
    );
    const result = await channel.send(
      message([{ ...subscription(ua, 'evil'), endpoint: 'https://169.254.169.254/latest' }]),
    );
    assert.deepEqual(result, { kind: 'failed', code: 'push_endpoint_not_allowed', gone: [] });
    assert.equal(requests.length, 0);
  });
});

describe('answers of the push service', () => {
  test('each status maps to the result of ADR-0008, section 8', () => {
    assert.deepEqual(classify(201, undefined), { kind: 'sent' });
    assert.deepEqual(classify(404, undefined), { kind: 'gone' });
    assert.deepEqual(classify(410, undefined), { kind: 'gone' });
    assert.deepEqual(classify(403, undefined), { kind: 'failed', code: 'push_forbidden' });
    assert.deepEqual(classify(413, undefined), { kind: 'failed', code: 'push_too_large' });
    assert.deepEqual(classify(400, undefined), { kind: 'failed', code: 'push_http_400' });
    assert.deepEqual(classify(301, undefined), { kind: 'failed', code: 'push_redirect' });
    assert.deepEqual(classify(429, 30), {
      kind: 'retry',
      code: 'push_rate_limited',
      retryAfterSeconds: 30,
    });
    assert.deepEqual(classify(503, undefined), { kind: 'retry', code: 'push_server_error' });
  });

  test('Retry-After in seconds or as a date', () => {
    const now = Date.parse('2026-11-02T12:00:00Z');
    assert.equal(retryAfterSeconds('120', now), 120);
    assert.equal(retryAfterSeconds('Mon, 02 Nov 2026 12:05:00 GMT', now), 300);
    assert.equal(retryAfterSeconds('Mon, 02 Nov 2026 11:00:00 GMT', now), 0);
    assert.equal(retryAfterSeconds(null, now), undefined);
    assert.equal(retryAfterSeconds('soon', now), undefined);
  });

  test('one delivery is enough; without one, a transient failure retries; gone ones are listed', () => {
    const sent = { kind: 'sent' } as const;
    const gone = { kind: 'gone' } as const;
    const busy = { kind: 'retry', code: 'push_server_error' } as const;
    const forbidden = { kind: 'failed', code: 'push_forbidden' } as const;
    assert.deepEqual(combine(['a', 'b', 'c'], [gone, sent, busy]), {
      kind: 'sent',
      delivered: ['b'],
      gone: ['a'],
    });
    assert.deepEqual(
      combine(
        ['a', 'b', 'c'],
        [
          forbidden,
          { kind: 'retry', code: 'push_rate_limited', retryAfterSeconds: 9 },
          { kind: 'retry', code: 'push_rate_limited', retryAfterSeconds: 40 },
        ],
      ),
      { kind: 'retry', code: 'push_rate_limited', retryAfterSeconds: 40, gone: [] },
    );
    assert.deepEqual(combine(['a', 'b'], [gone, forbidden]), {
      kind: 'failed',
      code: 'push_forbidden',
      gone: ['a'],
    });
    assert.deepEqual(combine(['a', 'b'], [gone, gone]), {
      kind: 'gone',
      subscriptionIds: ['a', 'b'],
    });
  });

  test('the request: encrypted body, VAPID, TTL, urgency, no redirect, nothing read back', async () => {
    const ua = await browser();
    let cancelled = false;
    const { channel, requests, clock } = await channelWith(async () => {
      const body = new ReadableStream({ cancel: () => void (cancelled = true) });
      return new Response(body, { status: 201 });
    });
    clock.now = Date.parse('2026-11-02T12:00:00Z');
    await channel.send(message([subscription(ua, 'a')], { anchorAt: '2026-11-02T12:30:00Z' }));
    const [request] = requests;
    assert.equal(request!.url, 'https://fcm.googleapis.com/fcm/send/a');
    assert.equal(request!.init.method, 'POST');
    assert.equal(request!.init.redirect, 'manual');
    const headers = request!.init.headers as Record<string, string>;
    assert.equal(headers['content-encoding'], 'aes128gcm');
    assert.equal(headers.ttl, '1800');
    assert.equal(headers.urgency, 'high');
    assert.match(headers.authorization!, /^vapid t=.+, k=.+$/);
    assert.equal(cancelled, true);
  });

  test('a network failure is a retry', async () => {
    const ua = await browser();
    const { channel } = await channelWith(async () => {
      throw new TypeError('fetch failed');
    });
    assert.deepEqual(await channel.send(message([subscription(ua, 'a')])), {
      kind: 'retry',
      code: 'push_network',
      retryAfterSeconds: undefined,
      gone: [],
    });
  });

  test('TTL: a reminder until its anchor, at least the minimum, never past the default', () => {
    const now = Date.parse('2026-11-02T12:00:00Z');
    const at = (anchorAt: string, type = 'task_reminder') =>
      ttlSeconds(message([], { anchorAt }, type), now, ttl);
    assert.equal(at('2026-11-02T12:30:00Z'), 1800);
    assert.equal(at('2026-11-02T12:00:10Z'), 60);
    assert.equal(at('2026-11-02T11:00:00Z'), 60);
    assert.equal(at('2026-12-02T12:00:00Z'), 86_400);
    assert.equal(at('2026-11-02T12:30:00Z', 'proof_disputed'), 86_400);
  });
});

describe('dispatch loop', () => {
  test('backoff doubles from the base, takes a longer Retry-After, and is capped', () => {
    assert.equal(backoffSeconds(1, undefined, retry), 60);
    assert.equal(backoffSeconds(2, undefined, retry), 120);
    assert.equal(backoffSeconds(4, undefined, retry), 480);
    assert.equal(backoffSeconds(2, 300, retry), 300);
    assert.equal(backoffSeconds(2, 10, retry), 120);
    assert.equal(backoffSeconds(9, undefined, retry), 3600);
    assert.equal(backoffSeconds(1, 99_999, retry), 3600);
  });

  test('a retry past maxAttempts is failed, with the gone subscriptions still listed', () => {
    const busy: SendResult = { kind: 'retry', code: 'push_server_error', gone: ['x'] };
    assert.deepEqual(toReport({ ...message([]), attempts: 4 }, busy, retry), {
      outboxId: 'outbox-1',
      status: 'retry',
      code: 'push_server_error',
      retryAfterSeconds: 480,
      goneSubscriptionIds: ['x'],
    });
    assert.deepEqual(toReport({ ...message([]), attempts: 5 }, busy, retry), {
      outboxId: 'outbox-1',
      status: 'failed',
      code: 'push_server_error',
      goneSubscriptionIds: ['x'],
    });
    assert.deepEqual(toReport(message([]), { kind: 'gone', subscriptionIds: ['a'] }, retry), {
      outboxId: 'outbox-1',
      status: 'failed',
      code: 'push_gone',
      goneSubscriptionIds: ['a'],
    });
  });

  test('claims until a short batch, reports each row once, and a throwing channel fails only its row', async () => {
    const full = (n: number, from: number): Batch => ({
      messages: Array.from({ length: n }, (_, i) => ({
        ...message([]),
        outboxId: `o${from + i}`,
        channel: from + i === 2 ? 'whatsapp' : 'web_push',
      })),
      invalid: from === 0 ? ['bad'] : [],
      expired: 0,
      cancelled: 0,
      deferred: 0,
    });
    const batches = [full(3, 0), full(1, 3)];
    const reported: Report[][] = [];
    const totals = await runDispatch({
      claim: async () => batches.shift() ?? full(0, 9),
      report: async (r) => void reported.push(r),
      channels: [
        {
          channel: 'web_push',
          send: async (m) => {
            if (m.outboxId === 'o1') throw new Error('render');
            return { kind: 'sent' };
          },
        },
      ],
      batchSize: 4,
      budgetMs: 60_000,
      retry,
      concurrency: 2,
    });
    assert.equal(reported.length, 2, 'two claims, the second one short');
    assert.deepEqual(
      reported.flat().map((r) => [r.outboxId, r.status, r.code]),
      [
        ['bad', 'failed', 'invalid_item'],
        ['o0', 'sent', undefined],
        ['o1', 'failed', 'send_error'],
        ['o2', 'failed', 'no_channel'],
        ['o3', 'sent', undefined],
      ],
    );
    assert.deepEqual(totals, {
      batches: 2,
      sent: 2,
      retried: 0,
      failed: 3,
      subscriptionsGone: 0,
      expired: 0,
      cancelled: 0,
      deferred: 0,
    });
  });

  test('stops at the budget even when the queue is full', async () => {
    let clock = 0;
    let claims = 0;
    await runDispatch({
      claim: async () => {
        claims += 1;
        clock += 600;
        return { messages: [], invalid: [], expired: 10, cancelled: 0, deferred: 0 };
      },
      report: async () => {},
      channels: [],
      batchSize: 10,
      budgetMs: 1000,
      retry,
      concurrency: 2,
      now: () => clock,
    });
    assert.equal(claims, 2);
  });
});

describe('WhatsApp channel', () => {
  const outbound = {
    kind: 'template' as const,
    to: '+5511912345678',
    template: 'daily_summary_v1',
    language: 'pt_BR',
    params: { date: 'segunda' },
  };
  const provider = (send: WhatsAppProvider['send']): WhatsAppProvider => ({
    name: 'console',
    send,
  });
  const row = { ...message([]), channel: 'whatsapp', phone: '+5511912345678' };

  test('accepted is sent, and the report carries what whatsapp_messages needs', async () => {
    const seen: unknown[] = [];
    const channel = new WhatsAppChannel(
      provider(async (m) => {
        seen.push(m);
        return { kind: 'accepted', providerMessageId: 'console.1', waId: null };
      }),
      () => outbound,
    );
    const result = await channel.send(row);
    assert.deepEqual(seen, [outbound]);
    assert.deepEqual(toReport(row, result, retry), {
      outboxId: 'outbox-1',
      status: 'sent',
      whatsapp: {
        providerMessageId: 'console.1',
        waId: null,
        template: 'daily_summary_v1',
        provider: 'console',
      },
    });
  });

  test("the provider's retry and failed pass through with their codes", async () => {
    const limited = new WhatsAppChannel(
      provider(async () => ({ kind: 'retry', code: 'wa_130429', retryAfterSeconds: 300 })),
      () => outbound,
    );
    assert.deepEqual(toReport(row, await limited.send(row), retry), {
      outboxId: 'outbox-1',
      status: 'retry',
      code: 'wa_130429',
      retryAfterSeconds: 300,
    });
    const refused = new WhatsAppChannel(
      provider(async () => ({ kind: 'failed', code: 'wa_131026' })),
      () => outbound,
    );
    assert.deepEqual(toReport(row, await refused.send(row), retry), {
      outboxId: 'outbox-1',
      status: 'failed',
      code: 'wa_131026',
    });
  });

  test('a provider that throws (the console insert) is a retry; a render that throws fails the row', async () => {
    const reports: Report[] = [];
    const run = (channel: WhatsAppChannel) =>
      runDispatch({
        claim: async () => ({
          messages: [row],
          invalid: [],
          expired: 0,
          cancelled: 0,
          deferred: 0,
        }),
        report: async (r) => reports.push(...r),
        channels: [channel],
        batchSize: 10,
        budgetMs: 1000,
        retry,
        concurrency: 1,
      });
    await run(
      new WhatsAppChannel(
        provider(async () => {
          throw new Error('insert failed');
        }),
        () => outbound,
      ),
    );
    await run(
      new WhatsAppChannel(
        provider(async () => ({ kind: 'accepted', providerMessageId: 'x', waId: null })),
        () => {
          throw new Error('whatsapp_type_not_allowed');
        },
      ),
    );
    assert.deepEqual(reports, [
      { outboxId: 'outbox-1', status: 'retry', code: 'wa_provider_error', retryAfterSeconds: 60 },
      { outboxId: 'outbox-1', status: 'failed', code: 'send_error' },
    ]);
  });
});

describe('native push (ADR-0012, section 11)', () => {
  const token = (id: string) => `ExponentPushToken[${id}]`;
  const device = (id: string) => ({ id, kind: 'expo' as const, expoToken: token(id) });
  // The function renders with nativePushMessageSchema, which Node cannot import; the shape is enough.
  const render = (m: OutboundMessage, to: string) =>
    ({
      to,
      title: m.taskTitle,
      data: { notificationId: m.notificationId },
    }) as unknown as NativePushMessage;
  const tickets = (...data: unknown[]) => new Response(JSON.stringify({ data }), { status: 200 });

  function nativeWith(answer: () => Promise<Response>, accessToken?: string) {
    const requests: { url: string; init: RequestInit }[] = [];
    const native = new NativePushChannel({
      render,
      accessToken,
      timeoutMs: 1000,
      fetch: (async (url: string, init: RequestInit) => {
        requests.push({ url, init });
        return answer();
      }) as typeof fetch,
    });
    return { native, requests };
  }

  test('each ticket maps to a delivery; DeviceNotRegistered is gone', () => {
    const error = (e?: string) => ({
      status: 'error' as const,
      details: e ? { error: e } : undefined,
    });
    assert.deepEqual(classifyTicket({ status: 'ok', id: 'x' }), { kind: 'sent' });
    assert.deepEqual(classifyTicket(error('DeviceNotRegistered')), { kind: 'gone' });
    assert.deepEqual(classifyTicket(error('MessageRateExceeded')), {
      kind: 'retry',
      code: 'expo_rate_limited',
    });
    assert.deepEqual(classifyTicket(error('MessageTooBig')), {
      kind: 'failed',
      code: 'expo_too_large',
    });
    assert.deepEqual(classifyTicket(error('InvalidCredentials')), {
      kind: 'failed',
      code: 'expo_credentials',
    });
    assert.deepEqual(classifyTicket(error()), { kind: 'failed', code: 'expo_error' });
  });

  test('one request for all the devices, to Expo, no redirect, the token only when configured', async () => {
    const { native, requests } = nativeWith(async () =>
      tickets({ status: 'ok', id: '1' }, { status: 'ok', id: '2' }),
    );
    const deliveries = await native.deliver(message([]), [device('a'), device('b')]);
    assert.deepEqual(deliveries, [{ kind: 'sent' }, { kind: 'sent' }]);
    assert.equal(requests.length, 1);
    const [request] = requests;
    assert.equal(request!.url, EXPO_PUSH_URL);
    assert.equal(request!.init.method, 'POST');
    assert.equal(request!.init.redirect, 'manual');
    assert.equal((request!.init.headers as Record<string, string>).authorization, undefined);
    assert.deepEqual(
      JSON.parse(String(request!.init.body)).map((m: NativePushMessage) => m.to),
      [token('a'), token('b')],
    );
    const secret = 'x'.repeat(40);
    const withToken = nativeWith(async () => tickets({ status: 'ok', id: '1' }), secret);
    await withToken.native.deliver(message([]), [device('a')]);
    assert.equal(
      (withToken.requests[0]!.init.headers as Record<string, string>).authorization,
      `Bearer ${secret}`,
    );
  });

  test('HTTP answers: 429 and 5xx retry, the rest fail, and a bad or short answer never retries', async () => {
    const run = async (answer: () => Promise<Response>) =>
      (await nativeWith(answer).native.deliver(message([]), [device('a')]))[0];
    assert.deepEqual(
      await run(async () => new Response(null, { status: 429, headers: { 'retry-after': '30' } })),
      { kind: 'retry', code: 'expo_rate_limited', retryAfterSeconds: 30 },
    );
    assert.deepEqual(await run(async () => new Response(null, { status: 503 })), {
      kind: 'retry',
      code: 'expo_server_error',
    });
    assert.deepEqual(await run(async () => new Response(null, { status: 400 })), {
      kind: 'failed',
      code: 'expo_http_400',
    });
    assert.deepEqual(await run(async () => new Response(null, { status: 302 })), {
      kind: 'failed',
      code: 'expo_redirect',
    });
    assert.deepEqual(
      await run(async () => {
        throw new TypeError('fetch failed');
      }),
      { kind: 'retry', code: 'expo_network' },
    );
    for (const body of ['not json', '{"errors":[{"code":"X"}]}', '{"data":[]}']) {
      assert.deepEqual(await run(async () => new Response(body, { status: 200 })), {
        kind: 'failed',
        code: 'expo_bad_response',
      });
    }
  });

  test('one browser and one device of the same user: neither failure stops the other', async () => {
    const ua = await browser();
    const gone = { status: 'error', details: { error: 'DeviceNotRegistered' } };
    const ok = { status: 'ok', id: '1' };
    const cases: [number, unknown, SendResult][] = [
      [201, ok, { kind: 'sent', delivered: ['web', 'app'], gone: [] }],
      [201, gone, { kind: 'sent', delivered: ['web'], gone: ['app'] }],
      [410, ok, { kind: 'sent', delivered: ['app'], gone: ['web'] }],
      [
        500,
        gone,
        { kind: 'retry', code: 'push_server_error', retryAfterSeconds: undefined, gone: ['app'] },
      ],
    ];
    for (const [status, ticket, expected] of cases) {
      const { native } = nativeWith(async () => tickets(ticket));
      const { channel, requests } = await channelWith(
        async () => new Response(null, { status }),
        native,
      );
      const result = await channel.send(message([subscription(ua, 'web'), device('app')]));
      assert.deepEqual(result, expected, `${status} ${JSON.stringify(ticket)}`);
      assert.equal(requests.length, 1, 'the browser got its own request');
    }
  });

  test('without a native transport the devices retry, and the browsers still get theirs', async () => {
    const ua = await browser();
    const { channel } = await channelWith(async () => new Response(null, { status: 201 }), null);
    assert.deepEqual(await channel.send(message([device('app')])), {
      kind: 'retry',
      code: 'native_push_not_configured',
      retryAfterSeconds: undefined,
      gone: [],
    });
    assert.deepEqual(await channel.send(message([subscription(ua, 'web'), device('app')])), {
      kind: 'sent',
      delivered: ['web'],
      gone: [],
    });
  });

  test('the transport: fake only when written, the real API only with expo and a token', () => {
    const real = (async () => new Response(null)) as typeof fetch;
    const logs: string[] = [];
    const log = (line: string) => logs.push(line);
    // BL23-1: absent or empty is not configured, never a silent fake.
    assert.equal(nativePushTransport({}, real, log), null);
    assert.equal(nativePushTransport({ NATIVE_PUSH_PROVIDER: '' }, real, log), null);
    const fake = nativePushTransport({ NATIVE_PUSH_PROVIDER: 'fake' }, real, log)!;
    assert.notEqual(fake.fetch, real);
    assert.equal(fake.accessToken, undefined);
    assert.equal(nativePushTransport({ NATIVE_PUSH_PROVIDER: 'expo' }, real, log), null);
    assert.equal(
      nativePushTransport({ NATIVE_PUSH_PROVIDER: 'expo', EXPO_ACCESS_TOKEN: 'short' }, real, log),
      null,
    );
    assert.equal(nativePushTransport({ NATIVE_PUSH_PROVIDER: 'other' }, real, log), null);
    assert.equal(nativePushTransport({ NATIVE_PUSH_PROVIDER: 'Fake' }, real, log), null);
    assert.deepEqual(logs, Array(6).fill(JSON.stringify({ event: 'native_push_not_configured' })));
    const secret = 'y'.repeat(40);
    const chosen = nativePushTransport(
      { NATIVE_PUSH_PROVIDER: 'expo', EXPO_ACCESS_TOKEN: secret },
      real,
      log,
    )!;
    assert.equal(chosen.fetch, real);
    assert.equal(chosen.accessToken, secret);
  });

  test('the fake answers one ok per message and logs only how many', async () => {
    const logs: string[] = [];
    const native = new NativePushChannel({
      render,
      timeoutMs: 1000,
      fetch: fakeExpoFetch((line) => logs.push(line)),
    });
    assert.deepEqual(await native.deliver(message([]), [device('a'), device('b')]), [
      { kind: 'sent' },
      { kind: 'sent' },
    ]);
    assert.deepEqual(logs, [JSON.stringify({ event: 'native_push_fake', messages: 2 })]);
  });
});

describe('translate', () => {
  const t = makeTranslate(messages, 'pt-BR');

  test('nested keys, interpolation without escaping, and the plural forms of i18next', () => {
    assert.equal(t('push.task_reminder.title', { task: 'Pão & "café" <b>' }), 'Pão & "café" <b>');
    assert.equal(t('push.lead.minutes', { count: 1 }), '1 minuto');
    assert.equal(t('push.lead.minutes', { count: 15 }), '15 minutos');
    assert.equal(t('push.lead.hours', { count: 2 }), '2 horas');
    assert.equal(t('push.lead.days', { count: 1 }), '1 dia');
    assert.equal(t('push.task_reminder.soon', { lead: '2 horas' }), 'Daqui a 2 horas.');
  });

  test('zero takes `_zero` (the plural), not the `one` of pt-BR; one stays singular', () => {
    assert.equal(t('push.lead.days', { count: 0 }), '0 dias');
    assert.equal(t('push.lead.days', { count: 1 }), '1 dia');
    // Without `_zero`, zero falls back to the forms of Intl.PluralRules as before.
    const bare = makeTranslate({ n_one: '{{count}} item', n_other: '{{count}} itens' }, 'pt-BR');
    assert.equal(bare('n', { count: 0 }), '0 item');
  });

  test('a missing key is the key, and a missing value is left as it is', () => {
    assert.equal(t('push.nope'), 'push.nope');
    assert.equal(t('push.task_reminder.soon'), 'Daqui a {{lead}}.');
  });
});

describe('hidden content (BL-32)', () => {
  const t = makeTranslate(messages, 'pt-BR');
  // What buildPushPayload gives for a reminder; Node cannot import it, the function passes the real one.
  const built: PushPayload = {
    v: 1,
    notificationId: 'n-1',
    type: 'task_reminder',
    title: 'Academia',
    body: 'Daqui a 2 horas.',
    url: '/tasks/occurrence-1',
    tag: 'n-1',
  };
  const payload = (m: OutboundMessage) => withHiddenContent(built, m.hideContent, t);
  // The same mapping as renderNative in index.ts, without nativePushMessageSchema (Node cannot import it).
  const renderNative = (m: OutboundMessage, to: string) => {
    const { v, notificationId, type, url, title, body } = payload(m);
    return { to, title, body, data: { v, notificationId, type, url } } as NativePushMessage;
  };

  async function sendBoth(hideContent: boolean) {
    const ua = await browser();
    const expo: NativePushMessage[] = [];
    const native = new NativePushChannel({
      render: renderNative,
      timeoutMs: 1000,
      fetch: (async (_url: string, init: RequestInit) => {
        expo.push(...(JSON.parse(String(init.body)) as NativePushMessage[]));
        return new Response(JSON.stringify({ data: [{ status: 'ok', id: '1' }] }), {
          status: 200,
        });
      }) as typeof fetch,
    });
    const { channel, requests } = await channelWith(
      async () => new Response(null, { status: 201 }),
      native,
      (m) => JSON.stringify(payload(m)),
    );
    const device = { id: 'd', kind: 'expo' as const, expoToken: 'ExponentPushToken[d]' };
    const sent = await channel.send({
      ...message([subscription(ua, 'w'), device]),
      hideContent,
    });
    assert.deepEqual(sent, { kind: 'sent', delivered: ['w', 'd'], gone: [] });
    const web = JSON.parse((await decrypt(requests[0]!.body, ua)).text) as PushPayload;
    return { web, device: expo[0]! };
  }

  test('on: the browser and the device get the neutral text, with the same url and tag', async () => {
    const { web, device } = await sendBoth(true);
    assert.deepEqual(web, { ...built, title: 'Novo aviso', body: 'Abra o app para ver.' });
    assert.equal(device.title, 'Novo aviso');
    assert.equal(device.body, 'Abra o app para ver.');
    assert.deepEqual(device.data, {
      v: 1,
      notificationId: 'n-1',
      type: 'task_reminder',
      url: built.url,
    });
    for (const text of [JSON.stringify(web), JSON.stringify(device)]) {
      assert.ok(!text.includes('Academia') && !text.includes('2 horas'), text);
    }
  });

  test('off: nothing changes', async () => {
    const { web, device } = await sendBoth(false);
    assert.deepEqual(web, built);
    assert.equal(device.title, 'Academia');
    assert.equal(device.body, 'Daqui a 2 horas.');
    assert.equal(device.data.url, built.url);
  });
});

// ---- helpers

function subscription(ua: Browser, id: string) {
  return {
    id,
    kind: 'web' as const,
    endpoint: `https://fcm.googleapis.com/fcm/send/${id}`,
    p256dh: toBase64Url(ua.publicKey),
    auth: toBase64Url(ua.auth),
  };
}

function message(
  subscriptions: OutboundMessage['subscriptions'],
  data: Record<string, unknown> = { leadMinutes: 0, anchorAt: '2026-11-02T12:00:00Z' },
  type = 'task_reminder',
): OutboundMessage {
  return {
    outboxId: 'outbox-1',
    notificationId: 'n-1',
    channel: 'web_push',
    type,
    data,
    occurrenceId: null,
    locale: 'pt-BR',
    taskTitle: 'Academia',
    hideContent: false,
    requiresPhotoProof: false,
    attempts: 1,
    scheduledFor: '2026-11-02T12:00:00Z',
    subscriptions,
    timezone: 'America/Sao_Paulo',
    overdueAt: null,
    occurrenceStatus: null,
    phone: null,
    summary: null,
  };
}

type Captured = { url: string; init: RequestInit; body: Uint8Array };
async function channelWith(
  answer: (url: string) => Promise<Response>,
  native?: NativePushChannel | null,
  render: (m: OutboundMessage) => string = (m) => JSON.stringify({ hello: m.taskTitle }),
) {
  const pair = await vapidPair();
  const vapid: VapidKeys = (await loadVapid(pair.d, pair.publicKey, 'mailto:ops@example.com'))!;
  const requests: Captured[] = [];
  const state = { now: Date.parse('2026-11-02T11:00:00Z') };
  const channel = new WebPushChannel({
    vapid,
    hosts,
    render,
    ttl,
    timeoutMs: 1000,
    now: () => state.now,
    native,
    fetch: (async (url: string, init: RequestInit) => {
      requests.push({ url, init, body: init.body as Uint8Array });
      return answer(url);
    }) as typeof fetch,
  });
  return { channel, requests, clock: state };
}
