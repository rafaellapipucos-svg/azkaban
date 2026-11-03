// Integration check of the real whatsapp-webhook against the local stack (ADR-0009, section 7). The
// app secret and the verify token are the local demo values of .env.example; the replies go to the
// ConsoleProvider's table, so nothing leaves this machine. Setup: _shared/proof-kit.ts.
import assert from 'node:assert/strict';
import { createHmac, randomUUID } from 'node:crypto';
import { after, describe, test } from 'node:test';
import { admin, cleanUp, functionUrl, newPerson } from '../_shared/proof-kit.ts';

const URL = functionUrl('whatsapp-webhook');
const APP_SECRET = process.env.WHATSAPP_APP_SECRET ?? 'local-demo-whatsapp-app-secret';
const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN ?? 'local-demo-whatsapp-verify-token';

const sign = (body: string | Buffer, secret = APP_SECRET) =>
  `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`;

async function post(body: string | Buffer, signature: string | null = sign(body)) {
  const res = await fetch(URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(signature === null ? {} : { 'x-hub-signature-256': signature }),
    },
    body,
  });
  return { status: res.status, text: await res.text() };
}

/** One change of `field = messages`, as Meta sends it, with some keys the schema drops. */
const webhook = (value: Record<string, unknown>) =>
  JSON.stringify({
    object: 'whatsapp_business_account',
    entry: [
      {
        id: '100',
        changes: [
          {
            field: 'messages',
            value: {
              messaging_product: 'whatsapp',
              metadata: { display_phone_number: '15550000000', phone_number_id: '200' },
              ...value,
            },
          },
        ],
      },
    ],
  });

const freshPhone = () => `+55119${String(Math.floor(Math.random() * 1e8)).padStart(8, '0')}`;

/** A user verified and opted in, as the RPCs would leave the profile. */
async function readyPerson(name: string) {
  const person = await newPerson(name);
  const phone = freshPhone();
  const now = new Date().toISOString();
  const { error } = await admin
    .from('profiles')
    .update({
      phone_e164: phone,
      phone_verified_at: now,
      whatsapp_opt_in_at: now,
      whatsapp_opt_in_version: 1,
    })
    .eq('id', person.id);
  assert.ifError(error);
  return { id: person.id, phone, waId: phone.slice(1) };
}

const optOut = async (id: string) => {
  const { data, error } = await admin
    .from('profiles')
    .select('whatsapp_opt_out_at, whatsapp_opt_out_source')
    .eq('id', id)
    .single();
  assert.ifError(error);
  return data;
};

const inbox = async (phone: string) => {
  const { data, error } = await admin
    .from('whatsapp_console_messages')
    .select('message')
    .eq('to_e164', phone);
  assert.ifError(error);
  return data.map((row) => row.message);
};

const textFrom = (from: string, body: string) => ({
  from,
  id: `wamid.${randomUUID()}`,
  timestamp: '1762171200',
  type: 'text',
  text: { body },
});

describe('whatsapp-webhook', () => {
  after(() => cleanUp([]));

  test('GET answers the challenge only with the verify token', async () => {
    const get = (params: Record<string, string>) =>
      fetch(`${URL}?${new URLSearchParams(params)}`, { method: 'GET' });
    const right = await get({
      'hub.mode': 'subscribe',
      'hub.verify_token': VERIFY_TOKEN,
      'hub.challenge': 'abc_123-XYZ',
    });
    assert.equal(right.status, 200);
    assert.equal(await right.text(), 'abc_123-XYZ');
    for (const params of [
      { 'hub.mode': 'subscribe', 'hub.verify_token': `${VERIFY_TOKEN}x`, 'hub.challenge': 'a' },
      { 'hub.mode': 'unsubscribe', 'hub.verify_token': VERIFY_TOKEN, 'hub.challenge': 'a' },
      { 'hub.mode': 'subscribe', 'hub.verify_token': VERIFY_TOKEN, 'hub.challenge': 'a b' },
      { 'hub.mode': 'subscribe', 'hub.challenge': 'a' },
    ]) {
      const res = await get(params);
      assert.equal(res.status, 403, JSON.stringify(params));
      await res.body?.cancel();
    }
  });

  test('a POST passes only with the HMAC of its raw bytes', async () => {
    // Spaces that a reserialization would drop: the signature is over these bytes, not the JSON.
    const body = webhook({ statuses: [] }).replace('{', '{ ');
    assert.equal((await post(body)).status, 200);
    assert.equal((await post(body, null)).status, 401);
    assert.equal((await post(body, sign(body, `${APP_SECRET}x`))).status, 401);
    assert.equal((await post(body, sign(body).toUpperCase())).status, 401);
    assert.equal((await post(body, sign(body).replace('sha256=', 'sha1='))).status, 401);
    assert.equal((await post(body, sign(JSON.stringify(JSON.parse(body))))).status, 401);
  });

  test('a body over 1 MiB is 413', async () => {
    const big = Buffer.alloc(1_048_577, 0x20);
    assert.equal((await post(big)).status, 413);
  });

  test('signed and invalid is 200, so Meta does not repeat it', async () => {
    for (const body of ['not json', '{"object":"page","entry":[]}', webhook({ statuses: 'x' })]) {
      const res = await post(body);
      assert.deepEqual(res, { status: 200, text: '' }, body);
    }
  });

  test('a status only moves forward, and failed keeps the code', async () => {
    const person = await readyPerson('status');
    const id = `wamid.${randomUUID()}`;
    const inserted = await admin.from('whatsapp_messages').insert({
      user_id: person.id,
      purpose: 'notification',
      template: 'daily_summary_v1',
      provider: 'meta',
      provider_message_id: id,
      recipient_wa_id: person.waId,
    });
    assert.ifError(inserted.error);
    const row = async () =>
      (
        await admin
          .from('whatsapp_messages')
          .select('status, error_code')
          .eq('provider_message_id', id)
          .single()
      ).data;
    const status = (name: string, extra: Record<string, unknown> = {}) =>
      post(
        webhook({
          statuses: [
            { id, status: name, timestamp: '1762171200', recipient_id: person.waId, ...extra },
          ],
        }),
      );

    assert.equal((await status('delivered')).status, 200);
    assert.deepEqual(await row(), { status: 'delivered', error_code: null });
    // A late `sent` and a repeated `delivered` change nothing.
    await status('sent');
    await status('delivered');
    assert.deepEqual(await row(), { status: 'delivered', error_code: null });
    await status('read');
    assert.deepEqual(await row(), { status: 'read', error_code: null });
    await status('failed', { errors: [{ code: 131026, title: 'x' }] });
    assert.deepEqual(await row(), { status: 'failed', error_code: 'wa_131026' });
  });

  test('PARAR turns the profile off, confirms once, and a repeated event confirms nothing', async () => {
    const stopper = await readyPerson('stop');
    const button = await readyPerson('button');
    const talker = await readyPerson('talk');
    const body = webhook({
      contacts: [{ wa_id: stopper.waId, profile: { name: 'x' } }],
      messages: [
        textFrom(stopper.waId, 'Parar.'),
        {
          from: button.waId,
          id: `wamid.${randomUUID()}`,
          type: 'button',
          button: { text: 'Parar', payload: 'Parar' },
        },
        textFrom(talker.waId, 'não quero parar'),
      ],
    });
    assert.equal((await post(body)).status, 200);

    for (const person of [stopper, button]) {
      const after = await optOut(person.id);
      assert.ok(after.whatsapp_opt_out_at, person.phone);
      assert.equal(after.whatsapp_opt_out_source, 'webhook');
      const sent = await inbox(person.phone);
      assert.equal(sent.length, 1);
      assert.equal(sent[0].kind, 'text');
      assert.match(sent[0].text, /não vai mais receber/);
    }
    assert.deepEqual(await optOut(talker.id), {
      whatsapp_opt_out_at: null,
      whatsapp_opt_out_source: null,
    });
    assert.deepEqual(await inbox(talker.phone), []);

    const replies = await admin
      .from('whatsapp_messages')
      .select('user_id, purpose, provider, recipient_wa_id')
      .eq('purpose', 'stop_reply')
      .in('recipient_wa_id', [stopper.waId, button.waId, talker.waId]);
    assert.ifError(replies.error);
    assert.equal(replies.data.length, 2);
    assert.ok(replies.data.every((r) => r.user_id === null && r.provider === 'console'));

    const first = await optOut(stopper.id);
    assert.equal((await post(body)).status, 200);
    assert.deepEqual(await optOut(stopper.id), first);
    assert.equal((await inbox(stopper.phone)).length, 1);
    assert.equal((await inbox(button.phone)).length, 1);
  });
});
