// Integration check of the real phone-verification against the local stack (ADR-0009, section 3),
// with the ConsoleProvider of .env.example: the code goes to whatsapp_console_messages, which only the
// service role reads, and nothing leaves this machine. Setup: _shared/proof-kit.ts.
import assert from 'node:assert/strict';
import { after, describe, test } from 'node:test';
import { ANON, admin, cleanUp, functionUrl, newPerson, type Person } from '../_shared/proof-kit.ts';

const URL = functionUrl('phone-verification');

/** A Brazilian mobile no other run uses, so the limit per number starts at zero. */
const freshPhone = () => `+55119${String(Math.floor(Math.random() * 1e8)).padStart(8, '0')}`;

async function ask(headers: Record<string, string>, body: string) {
  const res = await fetch(URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body,
  });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}

/** The newest message the console wrote to that number. */
async function inbox(phone: string) {
  const { data, error } = await admin
    .from('whatsapp_console_messages')
    .select('message')
    .eq('to_e164', phone)
    .order('created_at', { ascending: false });
  assert.ifError(error);
  return data.map((row) => row.message as Record<string, string>);
}

describe('phone-verification', () => {
  after(() => cleanUp([]));

  test('only a signed-in user may ask, and only by POST', async () => {
    const phone = freshPhone();
    const body = JSON.stringify({ phone });
    // The anon key passes the gateway but has no user; no key at all does not pass it.
    assert.equal((await ask({ authorization: `Bearer ${ANON}` }, body)).status, 401);
    assert.equal((await ask({}, body)).status, 401);
    const person = await newPerson('get');
    assert.equal((await fetch(URL, { method: 'GET', headers: person.bearer })).status, 405);
    assert.deepEqual(await inbox(phone), []);
  });

  test('a body that is not one E.164 phone, or over 1 KiB, is 400', async () => {
    const person = await newPerson('bad');
    for (const body of [
      '{',
      JSON.stringify({ phone: '11912345678' }),
      JSON.stringify({ phone: `+5511${'9'.repeat(2000)}` }),
    ]) {
      assert.deepEqual(await ask(person.bearer, body), {
        status: 400,
        body: { error: 'invalid_request' },
      });
    }
  });

  test('end to end: the code reaches the console, the RPC confirms it, and the profile is verified', async () => {
    const person: Person = await newPerson('verify');
    const phone = freshPhone();
    const started = await ask(person.bearer, JSON.stringify({ phone }));
    assert.equal(started.status, 200, JSON.stringify(started.body));
    assert.deepEqual(Object.keys(started.body).sort(), ['expiresAt', 'resendAt']);
    const ttl = (Date.parse(started.body.expiresAt) - Date.now()) / 60_000;
    assert.ok(ttl > 9 && ttl <= 10, `ttl ${ttl}`);

    const [message, ...rest] = await inbox(phone);
    assert.deepEqual(rest, []);
    assert.equal(message!.kind, 'code');
    assert.equal(message!.template, 'phone_code_v1');
    assert.equal(message!.language, 'pt_BR');
    assert.match(message!.code!, /^\d{6}$/);

    const line = await admin
      .from('whatsapp_messages')
      .select('purpose, template, provider, provider_message_id, status, outbox_id')
      .eq('user_id', person.id);
    assert.ifError(line.error);
    assert.equal(line.data.length, 1);
    assert.equal(line.data[0]!.purpose, 'phone_code');
    assert.equal(line.data[0]!.template, 'phone_code_v1');
    assert.equal(line.data[0]!.provider, 'console');
    assert.match(line.data[0]!.provider_message_id, /^console\./);
    assert.equal(line.data[0]!.status, 'accepted');

    const wrong = message!.code === '000000' ? '111111' : '000000';
    const miss = await person.client.rpc('confirm_phone_verification', { p_code: wrong });
    assert.ifError(miss.error);
    assert.deepEqual(miss.data, { error: 'phone_code_invalid' });
    const hit = await person.client.rpc('confirm_phone_verification', { p_code: message!.code });
    assert.ifError(hit.error);
    assert.equal(hit.data.phoneE164, phone);

    const profile = await admin
      .from('profiles')
      .select('phone_e164, phone_verified_at')
      .eq('id', person.id)
      .single();
    assert.ifError(profile.error);
    assert.equal(profile.data.phone_e164, phone);
    assert.ok(profile.data.phone_verified_at);
  });

  test('a second code before the resend wait is 429 with retryAfterSeconds, and sends nothing', async () => {
    const person = await newPerson('limit');
    const phone = freshPhone();
    assert.equal((await ask(person.bearer, JSON.stringify({ phone }))).status, 200);
    const again = await ask(person.bearer, JSON.stringify({ phone }));
    assert.equal(again.status, 429);
    assert.equal(again.body.error, 'phone_rate_limited');
    assert.ok(again.body.retryAfterSeconds > 0 && again.body.retryAfterSeconds <= 60);
    assert.equal((await inbox(phone)).length, 1);
  });

  test('a number of another country is 400 phone_country_not_allowed, and sends nothing', async () => {
    const person = await newPerson('country');
    const phone = `+1202555${String(Math.floor(Math.random() * 1e4)).padStart(4, '0')}`;
    const refused = await ask(person.bearer, JSON.stringify({ phone }));
    assert.equal(refused.status, 400);
    assert.deepEqual(refused.body, { error: 'phone_country_not_allowed' });
    assert.equal((await inbox(phone)).length, 0);
  });
});
