// The WhatsApp providers in Node, with no stack and no network: the Cloud API is a fake `fetch`.
// The token is made up here and must never come back out, in a result, an error or a log line.
import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, test } from 'node:test';
import type { WhatsAppOutbound } from '../../../../packages/contracts/src/whatsapp.ts';
import { whatsappDefaults } from '../../../../packages/config/src/whatsapp.ts';
import { parseWhatsAppEnv } from '../../../../packages/config/src/whatsapp-env.ts';
import {
  ConsoleProvider,
  createWhatsAppProvider,
  MetaCloudProvider,
  metaPayload,
  type ConsoleRecord,
} from './provider.ts';

const TOKEN = 'EAAG-test-token-that-must-never-leak-0123456789';
const PHONE_NUMBER_ID = '106540352242922';

const template: WhatsAppOutbound = {
  kind: 'template',
  to: '+5511987654321',
  template: 'daily_summary_v1',
  language: 'pt_BR',
  params: { date: 'segunda, 3 de nov.', today: 'Academia 07:00', footer: 'Bom dia' },
};
const code: WhatsAppOutbound = {
  kind: 'code',
  to: '+5511987654321',
  template: 'phone_code_v1',
  language: 'pt_BR',
  code: '493817',
};
const text: WhatsAppOutbound = { kind: 'text', to: '+5511987654321', text: 'Pronto, parou.' };

type Call = { url: string; init: RequestInit };

/** A fake `fetch` that answers each call with `answer`, and keeps what it was asked. */
function fakeFetch(answer: (call: Call) => Promise<Response> | Response) {
  const calls: Call[] = [];
  const fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    const call = { url: String(url), init: init ?? {} };
    calls.push(call);
    return answer(call);
  }) as typeof globalThis.fetch;
  return { fetch, calls };
}

const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });
const metaError = (status: number, metaCode: number, headers: Record<string, string> = {}) =>
  json(
    status,
    // A real error quotes the request; the provider must not pass any of it on.
    { error: { message: `(#${metaCode}) bad ${TOKEN}`, type: 'OAuthException', code: metaCode } },
    headers,
  );
const accepted = () =>
  json(200, {
    messaging_product: 'whatsapp',
    contacts: [{ input: '+5511987654321', wa_id: '5511987654321' }],
    messages: [{ id: 'wamid.HBgLNTUxMTk4NzY1NDMyMRUCABEYEjQ2' }],
  });

function meta(answer: (call: Call) => Promise<Response> | Response, timeoutMs = 1000) {
  const fake = fakeFetch(answer);
  const provider = new MetaCloudProvider({
    token: TOKEN,
    phoneNumberId: PHONE_NUMBER_ID,
    fetch: fake.fetch,
    baseUrl: whatsappDefaults.graphApiBaseUrl,
    version: whatsappDefaults.graphApiVersion,
    timeoutMs,
  });
  return { provider, calls: fake.calls };
}

// Every console line written while a test runs, to prove the token, the phone and the code are not in any.
let lines: string[] = [];
const originals = { log: console.log, error: console.error, warn: console.warn };
beforeEach(() => {
  lines = [];
  for (const name of ['log', 'error', 'warn'] as const) {
    console[name] = (...args: unknown[]) => lines.push(args.map(String).join(' '));
  }
});
afterEach(() => Object.assign(console, originals));

describe('metaPayload', () => {
  test('a template carries named body parameters', () => {
    assert.deepEqual(metaPayload(template), {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: '+5511987654321',
      type: 'template',
      template: {
        name: 'daily_summary_v1',
        language: { code: 'pt_BR' },
        components: [
          {
            type: 'body',
            parameters: [
              { type: 'text', text: 'segunda, 3 de nov.', parameter_name: 'date' },
              { type: 'text', text: 'Academia 07:00', parameter_name: 'today' },
              { type: 'text', text: 'Bom dia', parameter_name: 'footer' },
            ],
          },
        ],
      },
    });
  });

  test('a code goes in the body and again in the copy-code button', () => {
    assert.deepEqual(metaPayload(code), {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: '+5511987654321',
      type: 'template',
      template: {
        name: 'phone_code_v1',
        language: { code: 'pt_BR' },
        components: [
          { type: 'body', parameters: [{ type: 'text', text: '493817' }] },
          {
            type: 'button',
            sub_type: 'url',
            index: '0',
            parameters: [{ type: 'text', text: '493817' }],
          },
        ],
      },
    });
  });

  test('a text is a plain text message without a link preview', () => {
    assert.deepEqual(metaPayload(text), {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: '+5511987654321',
      type: 'text',
      text: { preview_url: false, body: 'Pronto, parou.' },
    });
  });
});

describe('MetaCloudProvider', () => {
  test('2xx is accepted, with the message id and the wa_id; the request is the documented one', async () => {
    const { provider, calls } = meta(accepted);
    const result = await provider.send(template);
    assert.deepEqual(result, {
      kind: 'accepted',
      providerMessageId: 'wamid.HBgLNTUxMTk4NzY1NDMyMRUCABEYEjQ2',
      waId: '5511987654321',
    });
    assert.equal(calls.length, 1);
    const { url, init } = calls[0]!;
    assert.equal(url, `https://graph.facebook.com/v26.0/${PHONE_NUMBER_ID}/messages`);
    assert.equal(init.method, 'POST');
    assert.equal(init.redirect, 'manual');
    assert.ok(init.signal instanceof AbortSignal);
    const headers = init.headers as Record<string, string>;
    assert.equal(headers.authorization, `Bearer ${TOKEN}`);
    assert.equal(headers['content-type'], 'application/json');
    assert.deepEqual(JSON.parse(String(init.body)), metaPayload(template));
  });

  test('a wa_id out of shape becomes null; a 2xx without a message id is a failure, not a retry', async () => {
    const odd = meta(() =>
      json(200, { contacts: [{ wa_id: '+55 11' }], messages: [{ id: 'wamid.x' }] }),
    );
    assert.deepEqual(await odd.provider.send(text), {
      kind: 'accepted',
      providerMessageId: 'wamid.x',
      waId: null,
    });
    for (const body of [
      '{}',
      'not json',
      JSON.stringify({ messages: [{ id: 'x'.repeat(129) }] }),
    ]) {
      const bad = meta(() => new Response(body, { status: 200 }));
      assert.deepEqual(await bad.provider.send(text), { kind: 'failed', code: 'wa_bad_response' });
    }
  });

  test('429 is a retry with Retry-After, and without it there is no wait', async () => {
    const limited = meta(() => json(429, {}, { 'retry-after': '120' }));
    assert.deepEqual(await limited.provider.send(code), {
      kind: 'retry',
      code: 'wa_rate_limited',
      retryAfterSeconds: 120,
    });
    const bare = meta(() => new Response('', { status: 429 }));
    assert.deepEqual(await bare.provider.send(code), { kind: 'retry', code: 'wa_rate_limited' });
  });

  test('5xx is a retry, with the Meta code when the body has one', async () => {
    const plain = meta(() => new Response('<html>oops</html>', { status: 503 }));
    assert.deepEqual(await plain.provider.send(template), { kind: 'retry', code: 'wa_http_503' });
    const coded = meta(() => metaError(500, 131000));
    assert.deepEqual(await coded.provider.send(template), { kind: 'retry', code: 'wa_131000' });
  });

  test('Meta codes 130429, 131056 and 133004 retry even on a 400; Retry-After goes along', async () => {
    const throttled = meta(() => metaError(400, 130429, { 'retry-after': '30' }));
    assert.deepEqual(await throttled.provider.send(template), {
      kind: 'retry',
      code: 'wa_130429',
      retryAfterSeconds: 30,
    });
    for (const metaCode of [131056, 133004]) {
      const other = meta(() => metaError(400, metaCode));
      assert.deepEqual(await other.provider.send(template), {
        kind: 'retry',
        code: `wa_${metaCode}`,
      });
    }
  });

  test('131026 (undeliverable) is a failure with its code', async () => {
    const { provider } = meta(() => metaError(400, 131026));
    assert.deepEqual(await provider.send(template), { kind: 'failed', code: 'wa_131026' });
  });

  test('another 4xx is a failure by Meta code, or by status without one', async () => {
    const coded = meta(() => metaError(401, 190));
    assert.deepEqual(await coded.provider.send(template), { kind: 'failed', code: 'wa_190' });
    const plain = meta(() => new Response('', { status: 404 }));
    assert.deepEqual(await plain.provider.send(template), { kind: 'failed', code: 'wa_http_404' });
  });

  test('a redirect is never followed: 3xx is wa_redirect, and nothing else is asked', async () => {
    const { provider, calls } = meta(
      () => new Response(null, { status: 307, headers: { location: 'https://evil.example/' } }),
    );
    assert.deepEqual(await provider.send(template), { kind: 'failed', code: 'wa_redirect' });
    assert.equal(calls.length, 1);
  });

  test('a network failure is a retry', async () => {
    const { provider } = meta(() => {
      throw new TypeError(`fetch failed for Bearer ${TOKEN}`);
    });
    assert.deepEqual(await provider.send(template), { kind: 'retry', code: 'wa_network' });
  });

  test('no answer within sendTimeoutMs is a retry with wa_timeout', async () => {
    const { provider } = meta(
      ({ init }) =>
        new Promise<Response>((_, reject) => {
          init.signal!.addEventListener('abort', () => reject(init.signal!.reason));
        }),
      20,
    );
    const began = Date.now();
    assert.deepEqual(await provider.send(template), { kind: 'retry', code: 'wa_timeout' });
    assert.ok(Date.now() - began < 1000);
  });

  test('the token is in the request and nowhere else: results, errors, logs, the object', async () => {
    const answers: (() => Response | Promise<Response>)[] = [
      accepted,
      () => metaError(400, 131026),
      () => metaError(500, 131000),
      () => json(429, { error: { message: TOKEN } }, { 'retry-after': '5' }),
      () => new Response(TOKEN, { status: 302, headers: { location: `https://x/?t=${TOKEN}` } }),
      () => new Response(TOKEN, { status: 200 }),
      () => {
        throw new Error(`connect ECONNREFUSED Bearer ${TOKEN}`);
      },
    ];
    for (const answer of answers) {
      const { provider, calls } = meta(answer);
      for (const message of [template, code, text]) {
        let out: string;
        try {
          out = JSON.stringify(await provider.send(message));
        } catch (error) {
          out = `${String(error)} ${(error as Error)?.stack ?? ''}`;
        }
        assert.ok(!out.includes(TOKEN), out);
      }
      assert.ok(
        calls.every((c) =>
          (c.init.headers as Record<string, string>).authorization!.includes(TOKEN),
        ),
      );
      assert.ok(!JSON.stringify(provider).includes(TOKEN));
      assert.ok(!String(provider).includes(TOKEN));
    }
    assert.ok(lines.every((line) => !line.includes(TOKEN)));
  });
});

describe('ConsoleProvider', () => {
  test('records the whole message, logs only kind and template, and answers console.<uuid>', async () => {
    const recorded: [string, WhatsAppOutbound][] = [];
    const record: ConsoleRecord = async (to, message) => {
      recorded.push([to, message]);
    };
    const provider = new ConsoleProvider(record);
    const first = await provider.send(code);
    const second = await provider.send(text);
    assert.deepEqual(recorded, [
      ['+5511987654321', code],
      ['+5511987654321', text],
    ]);
    for (const result of [first, second]) {
      assert.equal(result.kind, 'accepted');
      assert.match(
        result.kind === 'accepted' ? result.providerMessageId : '',
        /^console\.[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
      );
      assert.equal(result.kind === 'accepted' && result.waId, null);
    }
    assert.notEqual(JSON.stringify(first), JSON.stringify(second));
    assert.deepEqual(
      lines.map((line) => JSON.parse(line)),
      [
        { event: 'whatsapp_console', kind: 'code', template: 'phone_code_v1' },
        { event: 'whatsapp_console', kind: 'text', template: null },
      ],
    );
    for (const secret of ['+5511987654321', '5511987654321', '493817', 'Pronto']) {
      assert.ok(
        lines.every((line) => !line.includes(secret)),
        secret,
      );
    }
  });

  test('a failed write throws, and logs nothing', async () => {
    const provider = new ConsoleProvider(async () => {
      throw new Error('db down');
    });
    await assert.rejects(provider.send(template), /db down/);
    assert.deepEqual(lines, []);
  });
});

describe('createWhatsAppProvider', () => {
  const deps = { fetch: fakeFetch(accepted).fetch, record: async () => {} };

  test('an empty or absent WHATSAPP_PROVIDER is the console', () => {
    for (const values of [{}, { WHATSAPP_PROVIDER: '' }, { WHATSAPP_PROVIDER: 'console' }]) {
      const provider = createWhatsAppProvider(parseWhatsAppEnv(values), deps);
      assert.ok(provider instanceof ConsoleProvider);
      assert.equal(provider.name, 'console');
    }
  });

  test('meta needs its four secrets, and then sends to the configured number', async () => {
    assert.throws(() => parseWhatsAppEnv({ WHATSAPP_PROVIDER: 'meta' }));
    const fake = fakeFetch(accepted);
    const provider = createWhatsAppProvider(
      parseWhatsAppEnv({
        WHATSAPP_PROVIDER: 'meta',
        WHATSAPP_ACCESS_TOKEN: TOKEN,
        WHATSAPP_PHONE_NUMBER_ID: PHONE_NUMBER_ID,
        WHATSAPP_APP_SECRET: 'app-secret-0123456789',
        WHATSAPP_VERIFY_TOKEN: 'verify-token-0123456789',
      }),
      { fetch: fake.fetch, record: async () => assert.fail('the console must not be used') },
    );
    assert.ok(provider instanceof MetaCloudProvider);
    assert.equal((await provider.send(text)).kind, 'accepted');
    assert.equal(
      fake.calls[0]!.url,
      `https://graph.facebook.com/v26.0/${PHONE_NUMBER_ID}/messages`,
    );
  });
});
