// Integration check of the real proof-retention against the local stack (ADR-0007, section 14).
// Setup and warnings: _shared/proof-kit.ts. The job is global: it looks at every proof and object of
// the database, so each test leaves nothing due behind, and the first call clears what an earlier,
// interrupted run may have left.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import {
  CRON_SECRET,
  admin,
  backdateProof,
  challenge,
  cleanUp,
  functionUrl,
  newAuthor,
  newGroup,
  newOccurrence,
  objectsOf,
  occurrenceRow,
  proofsOf,
  sql,
  sqlMessages,
  upload,
  type Group,
  type Person,
} from '../_shared/proof-kit.ts';
import { makeJpeg } from '../proof-validate/jpeg-fixture.ts';

const URL = functionUrl('proof-retention');
const run = async (headers: Record<string, string> = { 'x-cron-secret': CRON_SECRET }) => {
  const response = await fetch(URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: '{}',
  });
  const text = await response.text();
  let body: any = text;
  try {
    body = JSON.parse(text);
  } catch {
    // Not JSON.
  }
  return { status: response.status, body };
};
const nothing = {
  photosRemoved: 0,
  proofsMarked: 0,
  orphansRemoved: 0,
  challengesDeleted: 0,
  recordsDeleted: 0,
  moreDue: false,
};

let salt = 0;
const photo = () =>
  makeJpeg({
    widthPx: 640,
    heightPx: 480,
    salt: `retention-${process.pid}-${Date.now()}-${(salt += 1)}`,
  });

describe('proof-retention', () => {
  let group: Group;
  const orphans: string[] = [];
  before(async () => {
    group = await newGroup();
    // Whatever an interrupted earlier run left, so the counts below are this file's alone.
    assert.equal((await run()).status, 200);
  });
  after(async () => {
    if (orphans.length > 0) await admin.storage.from('task-proofs').remove(orphans);
    await cleanUp([group]);
  });

  async function prove(spec: Parameters<typeof newOccurrence>[2] = {}, who?: Person) {
    const author = who ?? (await newAuthor(group));
    const { occurrenceId } = await newOccurrence(group, author, spec);
    const nonce = await challenge(author, occurrenceId);
    const sent = await upload(author, nonce, photo(), {
      meta: spec.place ? { location: { lat: -23.5505, lng: -46.6305, accuracyM: 12 } } : {},
      headers: { 'user-agent': 'azkaban-test/retention' },
    });
    assert.equal(sent.status, 200);
    return { author, occurrenceId, nonce, proofId: sent.body.proofId as string };
  }
  const exists = async (occurrenceId: string, nonce: string) =>
    (await objectsOf(occurrenceId)).includes(`${nonce}.jpg`);
  const xp = (occurrenceId: string) =>
    sql(`select count(*) from public.xp_events where occurrence_id = '${occurrenceId}'`)[0];

  test('only the cron secret opens it: no header, a wrong one, a user token and an empty one are refused', async () => {
    const refused = { status: 401, body: { error: 'unauthorized' } };
    assert.deepEqual(await run({}), refused);
    assert.deepEqual(await run({ 'x-cron-secret': 'not-the-secret' }), refused);
    assert.deepEqual(await run({ 'x-cron-secret': '' }), refused);
    assert.deepEqual(await run({ 'x-cron-secret': CRON_SECRET + 'x' }), refused);
    assert.deepEqual(await run({ 'x-cron-secret': CRON_SECRET.slice(0, -1) }), refused);
    assert.deepEqual(await run({ ...group.owner.bearer }), refused);
    assert.deepEqual(await run({ ...group.owner.bearer, 'x-cron-secret': 'nope' }), refused);

    // With the secret, and nothing to do, it answers with zeros.
    assert.deepEqual(await run(), { status: 200, body: nothing });
    const get = await fetch(URL, { method: 'GET' });
    assert.equal(get.status, 405);
    assert.equal((await fetch(URL, { method: 'OPTIONS' })).status, 204);
  });

  test('a photo past retention is removed and its row stays without the personal fields; one still inside stays whole', async () => {
    const old = await prove({ place: true });
    const young = await prove({ place: true });
    backdateProof(old.proofId, '91 days');
    const edge = await prove();
    backdateProof(edge.proofId, '89 days');
    const [was] = await proofsOf(old.occurrenceId);
    assert.equal(was.distance_m !== null && was.user_agent !== null, true);

    const res = await run();
    assert.deepEqual(res, {
      status: 200,
      body: { ...nothing, photosRemoved: 1, proofsMarked: 1 },
    });

    assert.equal(await exists(old.occurrenceId, old.nonce), false);
    const [now] = await proofsOf(old.occurrenceId);
    assert.ok(now.photo_deleted_at);
    assert.equal(now.storage_path, null);
    assert.equal(now.user_agent, null);
    assert.equal(now.distance_m, null);
    assert.equal(now.accuracy_m, null);
    // What stays: the evidence.
    assert.equal(now.sha256, was.sha256);
    assert.equal(now.received_at, was.received_at);
    assert.equal(now.size_bytes, was.size_bytes);
    assert.equal(now.user_id, was.user_id);
    assert.deepEqual(now.flags, was.flags);
    assert.equal(now.review_status, 'unreviewed');
    assert.equal((await occurrenceRow(old.occurrenceId)).status, 'done');

    // Inside the 90 days, nothing is touched.
    for (const kept of [young, edge]) {
      assert.equal(await exists(kept.occurrenceId, kept.nonce), true);
      const [row] = await proofsOf(kept.occurrenceId);
      assert.equal(row.photo_deleted_at, null);
      assert.equal(row.storage_path, `${kept.occurrenceId}/${kept.nonce}.jpg`);
    }

    // The URL of a photo that is gone says so.
    const ask = await fetch(functionUrl('proof-url'), {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...old.author.bearer },
      body: JSON.stringify({ proofId: old.proofId }),
    });
    assert.equal(ask.status, 410);
    assert.deepEqual(await ask.json(), { error: 'proof_photo_deleted' });

    // Running again changes nothing.
    assert.deepEqual(await run(), { status: 200, body: nothing });
    assert.equal(await exists(young.occurrenceId, young.nonce), true);

    // The one that was 89 days old is 91 tomorrow: now it goes too.
    backdateProof(edge.proofId, '2 days');
    assert.deepEqual(await run(), {
      status: 200,
      body: { ...nothing, photosRemoved: 1, proofsMarked: 1 },
    });
    assert.equal(await exists(edge.occurrenceId, edge.nonce), false);
    backdateProof(young.proofId, '91 days');
    assert.deepEqual(await run(), {
      status: 200,
      body: { ...nothing, photosRemoved: 1, proofsMarked: 1 },
    });
  });

  test('a proof still in review is approved once, with the XP, when its photo goes', async () => {
    const waiting = await prove({ approval: true });
    assert.equal(xp(waiting.occurrenceId), '0');
    backdateProof(waiting.proofId, '91 days');

    assert.deepEqual(await run(), {
      status: 200,
      body: { ...nothing, photosRemoved: 1, proofsMarked: 1 },
    });
    const row = await occurrenceRow(waiting.occurrenceId);
    assert.equal(row.status, 'done');
    assert.equal(row.proof_review_status, 'approved');
    const [proof] = await proofsOf(waiting.occurrenceId);
    assert.equal(proof.review_status, 'approved');
    assert.equal(proof.reviewed_by, null);
    assert.equal(proof.review_note, 'retention_auto_approved');
    assert.equal(xp(waiting.occurrenceId), '1');

    assert.deepEqual(await run(), { status: 200, body: nothing });
    assert.equal(xp(waiting.occurrenceId), '1', 'approved twice');
  });

  test('a run that died after removing the object is finished by the next one', async () => {
    const half = await prove({ approval: true });
    backdateProof(half.proofId, '91 days');
    // The object is gone, the row is not marked: where a worker that died in the middle leaves it.
    const removed = await admin.storage
      .from('task-proofs')
      .remove([`${half.occurrenceId}/${half.nonce}.jpg`]);
    assert.ifError(removed.error);
    assert.equal(await exists(half.occurrenceId, half.nonce), false);

    assert.deepEqual(await run(), {
      status: 200,
      body: { ...nothing, photosRemoved: 1, proofsMarked: 1 },
    });
    const [proof] = await proofsOf(half.occurrenceId);
    assert.ok(proof.photo_deleted_at);
    assert.equal(proof.review_status, 'approved');
    assert.equal(xp(half.occurrenceId), '1');
  });

  test('an object that no row points to goes after a day, and one that is younger, or has a row, stays', async () => {
    const live = await prove();
    const aged = (name: string, hours: number) =>
      sql(
        `update storage.objects set created_at = now() - interval '${hours} hours' where bucket_id = 'task-proofs' and name = '${name}'`,
      );
    const plant = async (hours: number) => {
      const name = `${randomUUID()}/${randomUUID()}.jpg`;
      orphans.push(name);
      const put = await admin.storage
        .from('task-proofs')
        .upload(name, photo(), { contentType: 'image/jpeg' });
      assert.ifError(put.error);
      aged(name, hours);
      return name;
    };
    const stale = await plant(25);
    const fresh = await plant(1);
    // A real proof's object, a day and more old, has its row: it is not an orphan.
    aged(`${live.occurrenceId}/${live.nonce}.jpg`, 30);

    assert.deepEqual(await run(), { status: 200, body: { ...nothing, orphansRemoved: 1 } });
    const present = async (name: string) => {
      const [dir, file] = name.split('/') as [string, string];
      return (await objectsOf(dir)).includes(file);
    };
    assert.equal(await present(stale), false);
    assert.equal(await present(fresh), true);
    assert.equal(await exists(live.occurrenceId, live.nonce), true);

    // The young one becomes an orphan too once it is old enough.
    aged(fresh, 25);
    assert.deepEqual(await run(), { status: 200, body: { ...nothing, orphansRemoved: 1 } });
    assert.equal(await present(fresh), false);
    assert.deepEqual(await run(), { status: 200, body: nothing });
  });

  test('a challenge nobody used is deleted after a day; a recent one, or one that became a proof, stays', async () => {
    const author = await newAuthor(group);
    const { occurrenceId } = await newOccurrence(group, author);
    const old = await challenge(author, occurrenceId);
    const recent = await challenge(author, occurrenceId);
    const used = await prove({}, author);
    const exist = (id: string) =>
      sql(`select count(*) from public.proof_challenges where id = '${id}'`)[0];
    const age = (id: string) =>
      sql(
        `update public.proof_challenges set created_at = now() - interval '25 hours', expires_at = now() - interval '24 hours 55 minutes' where id = '${id}'`,
      );
    age(old);
    age(used.nonce);

    assert.deepEqual(await run(), { status: 200, body: { ...nothing, challengesDeleted: 1 } });
    assert.equal(exist(old), '0');
    assert.equal(exist(recent), '1');
    assert.equal(exist(used.nonce), '1', 'the challenge of a proof is its evidence');
    assert.deepEqual(await run(), { status: 200, body: nothing });
  });

  test('a row without a photo goes after a year; a younger one stays, and a photo that old is removed first', async () => {
    const gone = await prove();
    const young = await prove();
    const late = await prove({ approval: true });
    backdateProof(gone.proofId, '91 days');
    backdateProof(young.proofId, '91 days');
    assert.deepEqual(await run(), {
      status: 200,
      body: { ...nothing, photosRemoved: 2, proofsMarked: 2 },
    });
    backdateProof(gone.proofId, '275 days');
    backdateProof(young.proofId, '273 days');
    backdateProof(late.proofId, '366 days');

    assert.deepEqual(await run(), {
      status: 200,
      body: { ...nothing, photosRemoved: 1, proofsMarked: 1, recordsDeleted: 2 },
    });
    assert.deepEqual(await proofsOf(gone.occurrenceId), []);
    const left = await occurrenceRow(gone.occurrenceId);
    assert.equal(left.status, 'done');
    assert.equal(left.current_proof_id, null);

    const [row] = await proofsOf(young.occurrenceId);
    assert.ok(row.photo_deleted_at);

    // The ordinary retention came first: the object is gone and the wait for an admin paid its XP.
    assert.equal(await exists(late.occurrenceId, late.nonce), false);
    assert.deepEqual(await proofsOf(late.occurrenceId), []);
    assert.equal(xp(late.occurrenceId), '1');

    assert.deepEqual(await run(), { status: 200, body: nothing });
  });

  describe('the cron call does not fail in silence (SEG-4)', () => {
    const call = 'select public.call_proof_retention()';
    const url = `select vault.create_secret('http://example.invalid/proof-retention', 'proof_retention_url');`;
    const secret = `select vault.create_secret('local-secret', 'cron_secret');`;
    // In a transaction that rolls back: the secrets do not stay, and the queued call never leaves.
    const configured = (then: string) => `begin; ${url} ${secret} ${then}; rollback;`;
    const queued = 'select count(*) from net.http_request_queue';

    test('without a Vault secret the run fails by name, so cron shows it, and nothing is called', () => {
      const before = sql(queued);
      for (const attempt of [call, `begin; ${url} ${call}; rollback;`]) {
        assert.match(sqlMessages(attempt), /ERROR: +proof_retention_not_configured/);
      }
      assert.equal(sqlMessages(configured(call)), '');
      assert.deepEqual(sql(queued), before);
    });

    test('with the secrets the call is queued, and a photo a day late warns without stopping it', async () => {
      const [before] = sql(queued);
      const count = () => sql(configured(`${call}; ${queued}`)).at(-1);
      const waited = String(Number(before) + 1);
      assert.equal(count(), waited);

      const late = await prove();
      backdateProof(late.proofId, '90 days 12 hours');
      assert.equal(sqlMessages(configured(call)), '', 'inside the day of tolerance');

      backdateProof(late.proofId, '1 day');
      assert.match(sqlMessages(configured(call)), /WARNING: +proof_retention_overdue/);
      assert.equal(count(), waited);

      assert.equal((await run()).status, 200);
      assert.equal(sqlMessages(configured(call)), '', 'the next run cleared it');
    });
  });
});
