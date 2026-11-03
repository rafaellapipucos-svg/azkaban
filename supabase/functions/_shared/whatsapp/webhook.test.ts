// The pure parts of whatsapp-webhook in Node, with no stack: the GET challenge, the signature over
// the raw bytes, the body limit, the stop words and what a POST asks of the database.
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { describe, test } from 'node:test';
import type { WhatsAppWebhook } from '../../../../packages/contracts/src/whatsapp.ts';
import { whatsappDefaults } from '../../../../packages/config/src/whatsapp.ts';
import { readLimited } from '../body.ts';
import { challengeAnswer, isStop, normalizeReply, readWebhook, validSignature } from './webhook.ts';

const APP_SECRET = 'app-secret-for-tests-0123456789';
const VERIFY_TOKEN = 'verify-token-for-tests-0123456789';
const OUR_NUMBER = '106540352242922';
const stopWords = whatsappDefaults.stopWords;

const encoder = new TextEncoder();
/** What Meta sends: `sha256=` and the lowercase hex HMAC of the bytes, computed apart from the code. */
const sign = (bytes: Uint8Array, secret = APP_SECRET) =>
  `sha256=${createHmac('sha256', secret).update(bytes).digest('hex')}`;

describe('challengeAnswer', () => {
  const params = (values: Record<string, string>) => new URLSearchParams(values);
  const good = {
    'hub.mode': 'subscribe',
    'hub.verify_token': VERIFY_TOKEN,
    'hub.challenge': '1158201444',
  };

  test('the right token answers the challenge', async () => {
    assert.equal(await challengeAnswer(params(good), VERIFY_TOKEN), '1158201444');
  });

  test('a wrong, missing or empty token, or none configured, is refused', async () => {
    for (const token of [`${VERIFY_TOKEN}x`, VERIFY_TOKEN.slice(0, -1), '', 'VERIFY-TOKEN']) {
      assert.equal(
        await challengeAnswer(params({ ...good, 'hub.verify_token': token }), VERIFY_TOKEN),
        null,
      );
    }
    const { 'hub.verify_token': _, ...withoutToken } = good;
    assert.equal(await challengeAnswer(params(withoutToken), VERIFY_TOKEN), null);
    assert.equal(await challengeAnswer(params(good), undefined), null);
    assert.equal(await challengeAnswer(params(good), ''), null);
  });

  test('another mode, or a challenge out of shape, is refused', async () => {
    assert.equal(
      await challengeAnswer(params({ ...good, 'hub.mode': 'unsubscribe' }), VERIFY_TOKEN),
      null,
    );
    for (const challenge of ['', '<script>', 'a b', 'x'.repeat(129)]) {
      assert.equal(
        await challengeAnswer(params({ ...good, 'hub.challenge': challenge }), VERIFY_TOKEN),
        null,
      );
    }
    assert.equal(
      await challengeAnswer(params({ ...good, 'hub.challenge': 'x'.repeat(128) }), VERIFY_TOKEN),
      'x'.repeat(128),
    );
  });
});

describe('validSignature', () => {
  // Spaces and key order on purpose: a reserialized body is different bytes.
  const raw = encoder.encode('{"object": "whatsapp_business_account",  "entry": [] }');

  test('the HMAC of the raw bytes passes', async () => {
    assert.equal(await validSignature(raw, sign(raw), APP_SECRET), true);
  });

  test('a wrong HMAC, another secret, or a changed byte is refused', async () => {
    const header = sign(raw);
    const flipped = header.slice(0, -1) + (header.endsWith('0') ? '1' : '0');
    assert.equal(await validSignature(raw, flipped, APP_SECRET), false);
    assert.equal(
      await validSignature(raw, sign(raw, 'another-secret-0123456789'), APP_SECRET),
      false,
    );
    const changed = raw.slice();
    changed[changed.length - 2] = 0x20 + 1;
    assert.equal(await validSignature(changed, header, APP_SECRET), false);
  });

  test('a missing header, or one in another shape, is refused', async () => {
    const hex = sign(raw).slice(7);
    for (const header of [
      null,
      '',
      hex,
      `sha1=${hex}`,
      `SHA256=${hex}`,
      `sha256=${hex.toUpperCase()}`,
      `sha256=${hex} `,
      `sha256=${hex.slice(0, 62)}`,
      `sha256=${Buffer.from(hex, 'hex').toString('base64')}`,
    ]) {
      assert.equal(await validSignature(raw, header, APP_SECRET), false, String(header));
    }
  });

  test('the signature of a reserialized body does not pass for the raw one', async () => {
    const reserialized = encoder.encode(JSON.stringify(JSON.parse(new TextDecoder().decode(raw))));
    assert.notDeepEqual(reserialized, raw);
    assert.equal(await validSignature(raw, sign(reserialized), APP_SECRET), false);
  });
});

describe('the body limit', () => {
  const body = (bytes: number) =>
    new ReadableStream<Uint8Array>({
      start(controller) {
        // In chunks, as a socket would deliver it.
        for (let sent = 0; sent < bytes; sent += 65_536) {
          controller.enqueue(new Uint8Array(Math.min(65_536, bytes - sent)));
        }
        controller.close();
      },
    });

  test('1 MiB passes, and 1 MiB + 1 is refused', async () => {
    const max = whatsappDefaults.webhookMaxBytes;
    assert.equal(max, 1_048_576);
    const at = await readLimited(body(max), max, 1000);
    assert.equal(at.kind === 'ok' && at.bytes.length, max);
    assert.deepEqual(await readLimited(body(max + 1), max, 1000), { kind: 'too_large' });
  });
});

describe('stop words', () => {
  test('PARAR, Parar., stop, Pare and the button "Parar" stop', () => {
    for (const text of [
      'PARAR',
      'Parar.',
      'stop',
      'Pare',
      'Parar',
      '  parar!  ',
      'Descadastrar',
      'SAIR',
    ]) {
      assert.equal(isStop(text, stopWords), true, text);
    }
  });

  test('a sentence with a stop word in it does not stop', () => {
    for (const text of [
      'não quero parar',
      'Quero parar amanhã',
      'parar?? não',
      'stopped',
      'pa rar',
      '',
    ]) {
      assert.equal(isStop(text, stopWords), false, text);
    }
  });

  test('the normal form drops accents, punctuation and symbols', () => {
    assert.equal(normalizeReply('  Não!  '), 'nao');
    assert.equal(normalizeReply('CANCELAR 🛑'), 'cancelar');
  });
});

describe('readWebhook', () => {
  const change = (
    value: WhatsAppWebhook['entry'][number]['changes'][number]['value'],
    field = 'messages',
  ) => ({
    field,
    value,
  });
  const webhook = (...changes: ReturnType<typeof change>[]): WhatsAppWebhook => ({
    object: 'whatsapp_business_account',
    entry: [{ changes }],
  });
  const metadata = { phone_number_id: OUR_NUMBER };

  test('statuses map to the contract; accepted, unknown names and other fields are ignored', () => {
    const work = readWebhook(
      webhook(
        change({
          metadata,
          statuses: [
            { id: 'wamid.1', status: 'sent', timestamp: '1762171200' },
            { id: 'wamid.1', status: 'delivered', timestamp: '1762171260' },
            { id: 'wamid.2', status: 'read' },
            {
              id: 'wamid.3',
              status: 'failed',
              timestamp: '1762171200',
              errors: [{ code: 131026 }],
            },
            { id: 'wamid.4', status: 'failed' },
            { id: 'wamid.5', status: 'accepted' },
            { id: 'wamid.6', status: 'deleted' },
            { id: 'wamid.7', status: 'sent', timestamp: '999999999999' },
          ],
        }),
        change({ metadata, statuses: [{ id: 'wamid.8', status: 'sent' }] }, 'account_update'),
      ),
      OUR_NUMBER,
      stopWords,
    );
    assert.deepEqual(work.statuses, [
      {
        providerMessageId: 'wamid.1',
        status: 'sent',
        at: '2025-11-03T12:00:00.000Z',
        errorCode: null,
      },
      {
        providerMessageId: 'wamid.1',
        status: 'delivered',
        at: '2025-11-03T12:01:00.000Z',
        errorCode: null,
      },
      { providerMessageId: 'wamid.2', status: 'read', at: null, errorCode: null },
      {
        providerMessageId: 'wamid.3',
        status: 'failed',
        at: '2025-11-03T12:00:00.000Z',
        errorCode: 'wa_131026',
      },
      { providerMessageId: 'wamid.4', status: 'failed', at: null, errorCode: null },
      { providerMessageId: 'wamid.7', status: 'sent', at: null, errorCode: null },
    ]);
    assert.equal(work.ignored, 2);
    assert.deepEqual(work.stopWaIds, []);
  });

  test('only our phone number id counts when there is one; the console takes any', () => {
    const payload = webhook(
      change({
        metadata: { phone_number_id: '999' },
        statuses: [{ id: 'wamid.x', status: 'sent' }],
      }),
      change({ statuses: [{ id: 'wamid.y', status: 'sent' }] }),
      change({ metadata, statuses: [{ id: 'wamid.z', status: 'sent' }] }),
    );
    assert.deepEqual(
      readWebhook(payload, OUR_NUMBER, stopWords).statuses.map((s) => s.providerMessageId),
      ['wamid.z'],
    );
    assert.deepEqual(
      readWebhook(payload, undefined, stopWords).statuses.map((s) => s.providerMessageId),
      ['wamid.x', 'wamid.y', 'wamid.z'],
    );
  });

  test('stop messages by text or button give their wa_id once; anything else is only counted', () => {
    const work = readWebhook(
      webhook(
        change({
          metadata,
          messages: [
            { from: '5511987654321', id: 'wamid.a', type: 'text', text: { body: 'Parar.' } },
            { from: '5511987654321', id: 'wamid.b', type: 'text', text: { body: 'PARAR' } },
            { from: '551187654321', id: 'wamid.c', type: 'button', button: { text: 'Parar' } },
            {
              from: '5521999990000',
              id: 'wamid.d',
              type: 'text',
              text: { body: 'não quero parar' },
            },
            { from: '5521999990001', id: 'wamid.e', type: 'image' },
          ],
        }),
        change({
          metadata: { phone_number_id: '999' },
          messages: [
            { from: '5531988887777', id: 'wamid.f', type: 'text', text: { body: 'stop' } },
          ],
        }),
      ),
      OUR_NUMBER,
      stopWords,
    );
    assert.deepEqual(work.stopWaIds, ['5511987654321', '551187654321']);
    assert.equal(work.ignored, 2);
    assert.deepEqual(work.statuses, []);
  });
});
