// Integration check of the real proof-url against the local stack (ADR-0007, section 12 and the table
// of who sees a proof in section 10). Setup and warnings: _shared/proof-kit.ts.
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { proofRules } from '../../../packages/config/src/proof.ts';
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
  sleep,
  upload,
  type Group,
  type Person,
} from '../_shared/proof-kit.ts';
import { apiUrl } from '../_shared/local-stack.mjs';
import { makeJpeg } from '../proof-validate/jpeg-fixture.ts';

const URL = functionUrl('proof-url');
const ask = async (who: Person | null, body: unknown) => {
  const response = await fetch(URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(who?.bearer ?? {}) },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
  const text = await response.text();
  let parsed: any = text;
  try {
    parsed = JSON.parse(text);
  } catch {
    // Not JSON.
  }
  return { status: response.status, body: parsed };
};

let salt = 0;
const photo = () =>
  makeJpeg({
    widthPx: 640,
    heightPx: 480,
    salt: `url-${process.pid}-${Date.now()}-${(salt += 1)}`,
  });

describe('proof-url', () => {
  let group: Group;
  let author: Person;
  let leaver: Person;
  let formerReviewer: Person;
  let outsider: Person;
  let proofId: string;
  let privateProofId: string;
  let formerAuthorProofId: string;
  let bytes: Uint8Array;
  let signed: { url: string; fetchedAt: number };

  async function prove(who: Person, spec: Parameters<typeof newOccurrence>[2] = {}) {
    const { occurrenceId } = await newOccurrence(group, who, spec);
    const nonce = await challenge(who, occurrenceId);
    const content = photo();
    const sent = await upload(who, nonce, content);
    assert.equal(sent.status, 200);
    return { proofId: sent.body.proofId as string, bytes: content };
  }

  before(async () => {
    group = await newGroup();
    author = await newAuthor(group);
    outsider = await newPerson('outsider');
    const first = await prove(author);
    proofId = first.proofId;
    bytes = first.bytes;
    privateProofId = (await prove(author, { visibility: 'private' })).proofId;

    // Someone who sent a proof and then left the group, and an admin who left too.
    leaver = await newAuthor(group);
    formerAuthorProofId = (await prove(leaver)).proofId;
    formerReviewer = await newPerson('former-reviewer');
    const joined = await admin
      .from('group_members')
      .insert({ group_id: group.id, user_id: formerReviewer.id, role: 'admin' });
    assert.ifError(joined.error);
    for (const gone of [leaver, formerReviewer]) {
      const left = await admin
        .from('group_members')
        .delete()
        .eq('group_id', group.id)
        .eq('user_id', gone.id);
      assert.ifError(left.error);
    }
  });
  after(async () => {
    await cleanUp([group]);
  });

  /** The URL of a local stack names the container network; the test reaches it through the gateway. */
  const reachable = (url: string) => {
    const parsed = new globalThis.URL(url);
    return `${apiUrl}${parsed.pathname}${parsed.search}`;
  };

  test('the author gets a URL that serves the photo, and the answer has exactly the contract fields', async () => {
    const res = await ask(author, { proofId });
    assert.equal(res.status, 200);
    assert.deepEqual(Object.keys(res.body).sort(), ['expiresInSeconds', 'url']);
    assert.equal(res.body.expiresInSeconds, proofRules.signedUrlTtlSeconds);
    assert.match(res.body.url, /\/storage\/v1\/object\/sign\/task-proofs\//);

    const fetchedAt = Date.now();
    const file = await fetch(reachable(res.body.url));
    assert.equal(file.status, 200);
    assert.equal(file.headers.get('content-type'), 'image/jpeg');
    assert.equal(sha256Hex(new Uint8Array(await file.arrayBuffer())), sha256Hex(bytes));
    signed = { url: res.body.url, fetchedAt };
  });

  test('the owner and an admin of the group get one too', async () => {
    for (const who of [group.owner, group.reviewer]) {
      const res = await ask(who, { proofId });
      assert.equal(res.status, 200);
      assert.equal((await fetch(reachable(res.body.url))).status, 200);
    }
  });

  test('another member of the group does not, and gets the same answer as for a proof that does not exist', async () => {
    const hidden = await ask(group.peer, { proofId });
    assert.deepEqual(hidden, { status: 403, body: { error: 'forbidden' } });
    const missing = await ask(group.peer, { proofId: crypto.randomUUID() });
    assert.deepEqual(missing, hidden);
    const stranger = await ask(outsider, { proofId });
    assert.deepEqual(stranger, hidden);
  });

  test('a former member does not, the author or not', async () => {
    assert.deepEqual(await ask(leaver, { proofId: formerAuthorProofId }), {
      status: 403,
      body: { error: 'forbidden' },
    });
    assert.deepEqual(await ask(formerReviewer, { proofId }), {
      status: 403,
      body: { error: 'forbidden' },
    });
    // The same proof is still served to who may see it.
    assert.equal((await ask(group.reviewer, { proofId: formerAuthorProofId })).status, 200);
  });

  test('a private task: the author sees it, an admin does not, not even the owner', async () => {
    const mine = await ask(author, { proofId: privateProofId });
    assert.equal(mine.status, 200);
    assert.equal((await fetch(reachable(mine.body.url))).status, 200);
    for (const who of [group.reviewer, group.owner]) {
      assert.deepEqual(await ask(who, { proofId: privateProofId }), {
        status: 403,
        body: { error: 'forbidden' },
      });
    }
  });

  test('without a user, or with a body that is not an id, nothing is signed', async () => {
    const none = await ask(null, { proofId });
    assert.equal(none.status, 401);
    assert.equal(none.body.code, 'UNAUTHORIZED_NO_AUTH_HEADER');

    const withAnon = await fetch(URL, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${ANON}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ proofId }),
    });
    assert.equal(withAnon.status, 401);
    assert.deepEqual(await withAnon.json(), { error: 'unauthorized' });

    for (const body of [
      '',
      '{nope',
      '[]',
      '{}',
      JSON.stringify({ proofId: 'abc' }),
      JSON.stringify({ proofId, extra: 'x'.repeat(2000) }),
    ]) {
      assert.deepEqual(
        await ask(author, body),
        { status: 400, body: { error: 'invalid_request' } },
        body.slice(0, 20),
      );
    }
    assert.equal((await ask(author, { proofId })).status, 200);
  });

  test('the limit of the body is 1 KiB: exactly that passes, one byte more does not', async () => {
    const padded = (size: number) => JSON.stringify({ proofId }).padEnd(size, ' ');
    assert.equal((await ask(author, padded(1024))).status, 200);
    assert.deepEqual(await ask(author, padded(1025)), {
      status: 400,
      body: { error: 'invalid_request' },
    });
  });

  test('a body of 400 MiB stops at the limit, and the worker survives it', async () => {
    const mebibyte = new Uint8Array(1024 * 1024).fill(0x20);
    let left = 400;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (left === 0) controller.close();
        else controller.enqueue(mebibyte);
        left -= 1;
      },
    });
    const response = await fetch(URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...author.bearer },
      body,
      // @ts-expect-error Node's fetch needs this for a stream body.
      duplex: 'half',
    });
    // Reading it all first answers 546: the worker runs out of memory.
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { error: 'invalid_request' });
  });

  test('only POST and OPTIONS', async () => {
    const get = await fetch(URL, { method: 'GET', headers: author.bearer });
    assert.equal(get.status, 405);
    assert.deepEqual(await get.json(), { error: 'method_not_allowed' });
    const preflight = await fetch(URL, { method: 'OPTIONS' });
    assert.equal(preflight.status, 204);
  });

  test('the URL stops working when its time is up, and was working until then', async () => {
    assert.ok(signed, 'the first test did not run');
    const dies = signed.fetchedAt + proofRules.signedUrlTtlSeconds * 1000;
    // Still inside the life of the URL: it serves.
    if (Date.now() < dies - 10_000) assert.equal((await fetch(reachable(signed.url))).status, 200);
    await sleep(Math.max(0, dies - Date.now()) + 3000);
    const late = await fetch(reachable(signed.url));
    assert.notEqual(late.status, 200);
    assert.ok(late.status >= 400 && late.status < 500, `${late.status}`);
    const body = await late.text();
    assert.ok(!body.includes('JFIF'), 'bytes came out');
    // A fresh URL for the same proof works again.
    const again = await ask(author, { proofId });
    assert.equal((await fetch(reachable(again.body.url))).status, 200);
  });
});
