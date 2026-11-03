// Integration check of the real account-export against the local stack (ADR-0012, section 2). Setup
// and warnings: _shared/proof-kit.ts. The handler's own checks: _shared/account.test.ts.
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { after, before, describe, test } from 'node:test';
import { privacyDefaults, rateLimitRules } from '../../../packages/config/src/limits.ts';
import {
  ANON,
  admin,
  challenge,
  cleanUp,
  functionUrl,
  newAuthor,
  newGroup,
  newOccurrence,
  newPerson,
  sha256Hex,
  upload,
  type Group,
  type Person,
} from '../_shared/proof-kit.ts';
import { apiUrl } from '../_shared/local-stack.mjs';
import { makeJpeg } from '../proof-validate/jpeg-fixture.ts';

// The contract files import each other without an extension, as the deno.json maps them.
registerHooks({
  resolve: (specifier, context, next) =>
    context.parentURL?.includes('/packages/contracts/src/') &&
    specifier.startsWith('.') &&
    !specifier.endsWith('.ts')
      ? next(`${specifier}.ts`, context)
      : next(specifier, context),
});
const { accountExportSchema, accountExportSections } =
  await import('../../../packages/contracts/src/privacy.ts');

const URL = functionUrl('account-export');
// In the formats the table checks: base64url of 65 and 16 bytes, an endpoint unique per run.
const endpointToken = `secret-endpoint-${crypto.randomUUID()}`;
const PUSH = {
  endpointToken,
  endpoint: `https://push.example.com/send/${endpointToken}`,
  p256dh: `secretP256dh${'x'.repeat(75)}`,
  auth: `secretAuth${'y'.repeat(12)}`,
};
const exportOf = async (headers: Record<string, string>) => {
  const response = await fetch(URL, { method: 'POST', headers });
  const text = await response.text();
  let body: any = text;
  try {
    body = JSON.parse(text);
  } catch {
    // Not JSON.
  }
  return { status: response.status, body, text, headers: response.headers };
};

/** The URL of a local stack names the container network; the test reaches it through the gateway. */
const reachable = (url: string) => {
  const parsed = new globalThis.URL(url);
  return `${apiUrl}${parsed.pathname}${parsed.search}`;
};

describe('account-export', () => {
  let group: Group;
  let author: Person;
  let proofId: string;
  let bytes: Uint8Array;
  let inviteCode: string;

  before(async () => {
    group = await newGroup();
    author = await newAuthor(group);
    const { occurrenceId } = await newOccurrence(group, author);
    const nonce = await challenge(author, occurrenceId);
    bytes = makeJpeg({ widthPx: 640, heightPx: 480, salt: `export-${process.pid}-${Date.now()}` });
    const sent = await upload(author, nonce, bytes);
    assert.equal(sent.status, 200);
    proofId = sent.body.proofId;

    // Secrets the file must leave out: a push subscription and an invite with its code.
    const push = await admin.from('push_subscriptions').insert({
      user_id: author.id,
      endpoint: PUSH.endpoint,
      p256dh: PUSH.p256dh,
      auth: PUSH.auth,
    });
    assert.ifError(push.error);
    const invite = await admin
      .from('group_invites')
      .insert({
        group_id: group.id,
        created_by: group.owner.id,
        expires_at: new Date(Date.now() + 86_400_000).toISOString(),
      })
      .select('code')
      .single();
    assert.ifError(invite.error);
    inviteCode = invite.data!.code;

    // The author leaves: an ex-member still gets their own proof.
    const left = await admin
      .from('group_members')
      .delete()
      .eq('group_id', group.id)
      .eq('user_id', author.id);
    assert.ifError(left.error);
  });
  after(async () => {
    await cleanUp([group]);
  });

  test('every section, the proof of an ex-member with a working photo link, and no secrets', async () => {
    const startedAt = Date.now();
    const res = await exportOf(author.bearer);
    assert.equal(res.status, 200);
    assert.match(
      res.headers.get('content-disposition') ?? '',
      /^attachment; filename="azkaban-dados-\d{4}-\d{2}-\d{2}\.json"$/,
    );
    assert.equal(res.headers.get('cache-control'), 'no-store');

    const file = accountExportSchema.parse(res.body);
    assert.equal(file.userId, author.id);
    assert.deepEqual(Object.keys(file.sections).sort(), [...accountExportSections].sort());
    const expires = Date.parse(file.photoUrlsExpireAt!);
    const ttl = privacyDefaults.exportPhotoUrlTtlSeconds * 1000;
    assert.ok(expires >= startedAt + ttl - 5000 && expires <= Date.now() + ttl, 'expiry');

    const proof = file.sections.proofs!.find((row) => row.id === proofId);
    assert.ok(proof, 'the proof of the ex-member is missing');
    assert.ok(!('storage_path' in proof));
    const photo = await fetch(reachable(proof.photo_url as string));
    assert.equal(photo.status, 200);
    assert.equal(sha256Hex(new Uint8Array(await photo.arrayBuffer())), sha256Hex(bytes));

    const push = file.sections.push_subscriptions!;
    assert.equal(push.length, 1);
    assert.equal(push[0]!.endpoint_host, 'push.example.com');
    for (const secret of [
      PUSH.endpointToken,
      PUSH.p256dh,
      PUSH.auth,
      'storage_path',
      'code_hash',
    ]) {
      assert.ok(!res.text.includes(secret), secret);
    }
    // Nobody else's data: the other members do not appear at all.
    for (const other of [group.peer, group.reviewer, group.owner]) {
      assert.ok(!res.text.includes(other.id), 'another member is in the file');
    }
  });

  test("the owner's file lists the invite without its code; one person's token never reaches another", async () => {
    const res = await exportOf(group.owner.bearer);
    assert.equal(res.status, 200);
    assert.equal(res.body.userId, group.owner.id);
    const invites = res.body.sections.created_invites as Record<string, unknown>[];
    assert.equal(invites.length, 1);
    assert.ok(!('code' in invites[0]!));
    assert.ok(!res.text.includes(inviteCode));
    for (const name of ['proofs', 'occurrences', 'xp_events'] as const) {
      const rows = res.body.sections[name] as Record<string, unknown>[];
      assert.ok(!rows.some((row) => row.id === proofId || row.user_id === author.id), name);
    }
  });

  test('without a user nothing is exported', async () => {
    const none = await exportOf({});
    assert.equal(none.status, 401);
    const withAnon = await exportOf({ authorization: `Bearer ${ANON}` });
    assert.deepEqual(
      { status: withAnon.status, body: withAnon.body },
      {
        status: 401,
        body: { error: 'unauthorized' },
      },
    );
  });

  test('the limit: the allowed exports pass, the next one is 429 with the wait', async () => {
    const person = await newPerson('export-limit');
    const { limit, windowSeconds } = rateLimitRules.actions.data_export;
    for (let i = 0; i < limit; i += 1) assert.equal((await exportOf(person.bearer)).status, 200);
    const refused = await exportOf(person.bearer);
    assert.equal(refused.status, 429);
    assert.equal(refused.body.error, 'rate_limited');
    assert.ok(
      Number.isInteger(refused.body.retryAfterSeconds) &&
        refused.body.retryAfterSeconds >= 1 &&
        refused.body.retryAfterSeconds <= windowSeconds,
      `${refused.body.retryAfterSeconds}`,
    );
    // Someone else is not affected.
    assert.equal((await exportOf((await newPerson('export-other')).bearer)).status, 200);
  });

  test('only POST and OPTIONS', async () => {
    const get = await fetch(URL, { method: 'GET', headers: author.bearer });
    assert.equal(get.status, 405);
    assert.equal((await fetch(URL, { method: 'OPTIONS' })).status, 204);
  });
});
