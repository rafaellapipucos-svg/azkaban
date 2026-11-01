// Integration check of the real proof-validate against the local stack (ADR-0007, sections 3 to 8).
// Setup and warnings: _shared/proof-kit.ts. The client in these tests is hostile: every rejection asserts
// the exact response and sits next to the same call that succeeds, because a function that refuses
// everything would pass a lone rejection.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { after, before, describe, test } from 'node:test';
import { proofDefaults, proofRules } from '../../../packages/config/src/proof.ts';
import {
  PLACE,
  admin,
  anon,
  challenge,
  cleanUp,
  functionUrl,
  newAuthor,
  newOccurrence,
  newPerson,
  objectsOf,
  occurrenceRow,
  proofsOf,
  sha256Hex,
  sleep,
  sql,
  upload,
  rawUpload,
  usedAt,
  type Group,
  type Person,
  newGroup,
} from '../_shared/proof-kit.ts';
import { makeJpeg } from './jpeg-fixture.ts';

let salt = 0;
/** Bytes no other test sent: the hash of a proof is unique. */
const unique = () => `validate-${process.pid}-${Date.now()}-${(salt += 1)}`;
const photo = (widthPx = 640, heightPx = 480) => makeJpeg({ widthPx, heightPx, salt: unique() });
const photoOfSize = (totalBytes: number) =>
  makeJpeg({ widthPx: 640, heightPx: 480, totalBytes, salt: unique() });

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;

describe('proof-validate', () => {
  let group: Group;
  before(async () => {
    group = await newGroup();
  });
  after(async () => {
    await cleanUp([group]);
  });

  /** Author, occurrence, nonce. */
  async function ready(spec: Parameters<typeof newOccurrence>[2] = {}) {
    const author = await newAuthor(group);
    const spot = await newOccurrence(group, author, spec);
    const nonce = await challenge(author, spot.occurrenceId);
    return { author, ...spot, nonce };
  }

  /** The state the occurrence must keep after every refusal. */
  async function assertUntouched(occurrenceId: string) {
    const row = await occurrenceRow(occurrenceId);
    assert.equal(row.status, 'pending');
    assert.equal(row.current_proof_id, null);
    assert.deepEqual(await proofsOf(occurrenceId), []);
    assert.deepEqual(await objectsOf(occurrenceId), []);
  }

  describe('the way to green', () => {
    test('a valid photo turns the occurrence green, with the bytes stored and the hash of the server', async () => {
      // One test per file signs in through Auth, as the app does.
      const author = await newAuthor(group, { signIn: true });
      const { occurrenceId } = await newOccurrence(group, author);
      const nonce = await challenge(author, occurrenceId);
      const bytes = photo(640, 480);

      const res = await upload(author, nonce, bytes);
      assert.equal(res.status, 200);
      assert.deepEqual(Object.keys(res.body).sort(), [
        'flags',
        'late',
        'occurrenceId',
        'proofId',
        'receivedAt',
        'reviewStatus',
        'status',
      ]);
      assert.match(res.body.proofId, UUID);
      assert.match(res.body.receivedAt, INSTANT);
      assert.deepEqual(
        { ...res.body, proofId: 'x', receivedAt: 'x' },
        {
          proofId: 'x',
          occurrenceId,
          status: 'done',
          reviewStatus: 'unreviewed',
          receivedAt: 'x',
          late: false,
          flags: [],
        },
      );

      const row = await occurrenceRow(occurrenceId);
      assert.equal(row.status, 'done');
      assert.equal(row.current_proof_id, res.body.proofId);
      assert.equal(row.proof_review_status, 'unreviewed');

      const [proof] = await proofsOf(occurrenceId);
      assert.equal(proof.id, res.body.proofId);
      assert.equal(proof.sha256, sha256Hex(bytes));
      assert.equal(proof.size_bytes, bytes.length);
      assert.equal(proof.width_px, 640);
      assert.equal(proof.height_px, 480);
      assert.equal(proof.storage_path, `${occurrenceId}/${nonce}.jpg`);
      assert.equal(proof.user_id, author.id);
      assert.equal(proof.platform, 'web');
      assert.equal(proof.app_version, '1.0.0');
      assert.equal(proof.user_agent, 'azkaban-test/1');
      assert.equal(proof.review_status, 'unreviewed');
      // The official time is the server's: the instant the nonce was spent.
      assert.equal(Date.parse(proof.received_at), Date.parse(res.body.receivedAt));
      assert.equal(Date.parse(usedAt(nonce)!), Date.parse(res.body.receivedAt));
      assert.ok(Math.abs(Date.parse(res.body.receivedAt) - Date.now()) < 30_000);

      assert.deepEqual(await objectsOf(occurrenceId), [`${nonce}.jpg`]);
      const stored = await admin.storage
        .from('task-proofs')
        .download(`${occurrenceId}/${nonce}.jpg`);
      assert.ifError(stored.error);
      assert.equal(sha256Hex(new Uint8Array(await stored.data!.arrayBuffer())), sha256Hex(bytes));

      // The history says the author did it, not a job.
      const [who] = sql(
        `select changed_by from public.task_status_history where occurrence_id = '${occurrenceId}' and to_status = 'done'`,
      );
      assert.equal(who, author.id);
    });

    test('with admin approval the proof waits in review, and green still shows', async () => {
      const { author, occurrenceId, nonce } = await ready({ approval: true });
      const res = await upload(author, nonce, photo());
      assert.equal(res.status, 200);
      assert.equal(res.body.reviewStatus, 'in_review');
      assert.equal(res.body.status, 'done');
      const row = await occurrenceRow(occurrenceId);
      assert.equal(row.status, 'done');
      assert.equal(row.proof_review_status, 'in_review');
      // No XP until the admin approves (ADR-0007, section 11).
      assert.deepEqual(
        sql(`select count(*) from public.xp_events where occurrence_id = '${occurrenceId}'`),
        ['0'],
      );
    });

    test('without approval the XP is granted at once', async () => {
      const { author, occurrenceId, nonce } = await ready();
      assert.equal((await upload(author, nonce, photo())).status, 200);
      assert.deepEqual(
        sql(`select count(*) from public.xp_events where occurrence_id = '${occurrenceId}'`),
        ['1'],
      );
    });

    test('the edge sizes are accepted', async () => {
      for (const [w, h] of [
        [320, 320],
        [2048, 2048],
        [2048, 320],
      ] as const) {
        const { author, occurrenceId, nonce } = await ready();
        const res = await upload(author, nonce, photo(w, h));
        assert.equal(res.status, 200, `${w}x${h}`);
        const [proof] = await proofsOf(occurrenceId);
        assert.deepEqual([proof.width_px, proof.height_px], [w, h]);
      }
    });
  });

  describe('who is calling', () => {
    test('no JWT is refused by the gateway, an anon key by the function, and neither spends the nonce', async () => {
      const { author, occurrenceId, nonce } = await ready();
      const bytes = photo();

      const none = await upload(null, nonce, bytes);
      assert.equal(none.status, 401);
      assert.deepEqual(none.body, {
        code: 'UNAUTHORIZED_NO_AUTH_HEADER',
        message: 'Missing authorization header',
        msg: 'Missing authorization header',
      });

      const withAnon = await fetch(functionUrl('proof-validate'), {
        method: 'POST',
        headers: {
          authorization: `Bearer ${await anonToken()}`,
          'content-type': 'image/jpeg',
          'x-proof-meta': encodeURIComponent(
            JSON.stringify({
              nonce,
              sha256: sha256Hex(bytes),
              capturedAtDevice: new Date().toISOString(),
              location: null,
              platform: 'web',
              appVersion: '1',
            }),
          ),
        },
        body: bytes,
      });
      assert.equal(withAnon.status, 401);
      assert.deepEqual(await withAnon.json(), { error: 'unauthorized' });
      assert.equal(usedAt(nonce), null);
      await assertUntouched(occurrenceId);

      // The same request, with the user, goes through.
      assert.equal((await upload(author, nonce, bytes)).status, 200);
    });

    test('the nonce of another user looks like one that does not exist, and stays unspent', async () => {
      const mine = await ready();
      const theirs = await ready();
      const bytes = photo();

      const res = await upload(theirs.author, mine.nonce, bytes);
      assert.deepEqual(res, { ...res, status: 409, body: { error: 'challenge_invalid' } });
      assert.equal(usedAt(mine.nonce), null);
      const invented = await upload(mine.author, crypto.randomUUID(), bytes);
      assert.deepEqual(invented.body, { error: 'challenge_invalid' });

      assert.equal((await upload(mine.author, mine.nonce, bytes)).status, 200);
    });

    test('an expired nonce is refused, and a fresh one for the same occurrence works', async () => {
      const { author, occurrenceId, nonce } = await ready();
      sql(
        `update public.proof_challenges set created_at = now() - interval '10 minutes', expires_at = now() - interval '5 minutes' where id = '${nonce}'`,
      );
      const res = await upload(author, nonce, photo());
      assert.equal(res.status, 410);
      assert.deepEqual(res.body, { error: 'challenge_expired' });
      assert.equal(usedAt(nonce), null);
      await assertUntouched(occurrenceId);

      const fresh = await challenge(author, occurrenceId);
      assert.equal((await upload(author, fresh, photo())).status, 200);
    });

    test('a used nonce is refused, even with other bytes, and nothing is committed twice', async () => {
      const { author, occurrenceId, nonce } = await ready();
      const first = await upload(author, nonce, photo());
      assert.equal(first.status, 200);

      const again = await upload(author, nonce, photo());
      assert.equal(again.status, 409);
      assert.deepEqual(again.body, { error: 'challenge_used' });
      assert.equal((await proofsOf(occurrenceId)).length, 1);
      assert.deepEqual(await objectsOf(occurrenceId), [`${nonce}.jpg`]);
    });

    test('two sends of one nonce at once: one wins, one object, one row', async () => {
      const { author, occurrenceId, nonce } = await ready();
      const replies = await Promise.all([
        upload(author, nonce, photo()),
        upload(author, nonce, photo()),
        upload(author, nonce, photo()),
      ]);
      const statuses = replies.map((r) => r.status).sort();
      assert.deepEqual(statuses, [200, 409, 409]);
      for (const loser of replies.filter((r) => r.status === 409)) {
        assert.deepEqual(loser.body, { error: 'challenge_used' });
      }
      assert.equal((await proofsOf(occurrenceId)).length, 1);
      assert.deepEqual(await objectsOf(occurrenceId), [`${nonce}.jpg`]);
    });

    test('without consent there is no challenge, and no nonce to invent', async () => {
      const author = await newAuthor(group, { consent: false });
      const { occurrenceId } = await newOccurrence(group, author);
      const refused = await author.client.rpc('issue_proof_challenge', {
        p_occurrence_id: occurrenceId,
      });
      assert.equal(refused.error?.message, 'proof_consent_required');
      assert.equal(refused.error?.code, 'P0001');

      const invented = await upload(author, crypto.randomUUID(), photo());
      assert.deepEqual(invented, {
        ...invented,
        status: 409,
        body: { error: 'challenge_invalid' },
      });
      await assertUntouched(occurrenceId);

      // After the acceptance the same user gets one and finishes.
      assert.ifError((await author.client.rpc('record_proof_consent', { p_version: 1 })).error);
      const nonce = await challenge(author, occurrenceId);
      assert.equal((await upload(author, nonce, photo())).status, 200);
    });
  });

  describe('what is announced is checked before the nonce is spent', () => {
    test('a Content-Type that is not image/jpeg is refused with the nonce intact', async () => {
      const { author, occurrenceId, nonce } = await ready();
      const bytes = photo();
      for (const type of [
        'image/png',
        'text/html',
        'application/octet-stream',
        'multipart/form-data',
      ]) {
        const res = await upload(author, nonce, bytes, { headers: { 'content-type': type } });
        assert.equal(res.status, 415, type);
        assert.deepEqual(res.body, { error: 'proof_bad_type' });
      }
      assert.equal(usedAt(nonce), null);
      await assertUntouched(occurrenceId);
      // With a parameter on the right type, it passes.
      const ok = await upload(author, nonce, bytes, {
        headers: { 'content-type': 'image/jpeg; charset=binary' },
      });
      assert.equal(ok.status, 200);
    });

    test('a Content-Length above the limit is refused with the nonce intact', async () => {
      const { author, occurrenceId, nonce } = await ready();
      const over = photoOfSize(proofRules.maxBytes + 1);
      const res = await upload(author, nonce, over);
      assert.equal(res.status, 413);
      assert.deepEqual(res.body, { error: 'proof_too_large' });
      assert.equal(usedAt(nonce), null);
      await assertUntouched(occurrenceId);

      const at = photoOfSize(proofRules.maxBytes);
      const ok = await upload(author, nonce, at);
      assert.equal(ok.status, 200);
      assert.equal((await proofsOf(occurrenceId))[0]!.size_bytes, proofRules.maxBytes);
    });

    test('a missing, malformed or oversized x-proof-meta is a 400 with the nonce intact', async () => {
      const { author, occurrenceId, nonce } = await ready();
      const bytes = photo();
      const good = {
        nonce,
        sha256: sha256Hex(bytes),
        capturedAtDevice: new Date().toISOString(),
        location: null,
        platform: 'web',
        appVersion: '1.0.0',
      };
      const bad: Record<string, string | null> = {
        missing: null,
        'not json': encodeURIComponent('{nope'),
        'bad escape': '%E0%A4%A',
        array: encodeURIComponent('[]'),
        'no nonce': encodeURIComponent(JSON.stringify({ ...good, nonce: undefined })),
        'nonce is not an id': encodeURIComponent(JSON.stringify({ ...good, nonce: 'abc' })),
        'sha256 in capitals': encodeURIComponent(
          JSON.stringify({ ...good, sha256: sha256Hex(bytes).toUpperCase() }),
        ),
        'sha256 too short': encodeURIComponent(JSON.stringify({ ...good, sha256: 'ab' })),
        'date is not an instant': encodeURIComponent(
          JSON.stringify({ ...good, capturedAtDevice: 'yesterday' }),
        ),
        'platform unknown': encodeURIComponent(JSON.stringify({ ...good, platform: 'desktop' })),
        'text of 41 characters': encodeURIComponent(
          JSON.stringify({ ...good, appVersion: 'v'.repeat(41) }),
        ),
        'latitude out of range': encodeURIComponent(
          JSON.stringify({ ...good, location: { lat: 91, lng: 0, accuracyM: 5 } }),
        ),
        'header of 5000 characters':
          encodeURIComponent(JSON.stringify({ ...good, appVersion: 'v' })) + '%20'.repeat(2000),
      };
      for (const [name, value] of Object.entries(bad)) {
        const res = await upload(author, nonce, bytes, { headers: { 'x-proof-meta': value } });
        assert.equal(res.status, 400, name);
        assert.deepEqual(res.body, { error: 'invalid_request' }, name);
      }
      assert.equal(usedAt(nonce), null);
      await assertUntouched(occurrenceId);
      assert.equal((await upload(author, nonce, bytes)).status, 200);
    });

    test('only POST and OPTIONS are served, and the preflight allows x-proof-meta', async () => {
      const get = await fetch(functionUrl('proof-validate'), {
        method: 'GET',
        headers: (await newPerson('get')).bearer,
      });
      assert.equal(get.status, 405);
      assert.deepEqual(await get.json(), { error: 'method_not_allowed' });

      const preflight = await fetch(functionUrl('proof-validate'), { method: 'OPTIONS' });
      assert.equal(preflight.status, 204);
      assert.match(preflight.headers.get('access-control-allow-headers')!, /x-proof-meta/);
      assert.match(preflight.headers.get('access-control-allow-headers')!, /authorization/);
      assert.equal(preflight.headers.get('access-control-allow-methods'), 'POST, OPTIONS');
    });
  });

  describe('the body is read as a stream, with a limit', () => {
    // These go straight to the Edge Runtime (see rawUpload): the gateway buffers a body whole, which
    // would hide both the cut and the stall from the function. The runtime holds the answer of the
    // function until the sender ends its body, so each test ends it and then reads the answer.
    test('a body past the limit with no Content-Length is refused at the limit, whatever the sender has left', async () => {
      const { author, occurrenceId, nonce } = await ready();
      const piece = new Uint8Array(65_536).fill(0xab);
      const request = rawUpload(author, nonce, piece);
      // 8 MiB for a limit of 2 MiB.
      for (let sent = 0; sent < 8 * 1024 * 1024 && request.isOpen(); sent += piece.length) {
        await request.send(piece);
      }
      request.end();
      const res = await request.reply;
      assert.equal(res.status, 413);
      assert.deepEqual(res.body, { error: 'proof_too_large' });
      // The nonce was spent before the body was read, so this attempt is gone.
      assert.notEqual(usedAt(nonce), null);
      await assertUntouched(occurrenceId);

      // A new challenge, a normal photo: fine.
      const next = await challenge(author, occurrenceId);
      assert.equal((await upload(author, next, photo())).status, 200);
    });

    test('exactly the limit passes with no Content-Length, and one byte more does not', async () => {
      const at = photoOfSize(proofRules.maxBytes);
      const over = photoOfSize(proofRules.maxBytes + 1);
      const send = async (who: Person, nonce: string, bytes: Uint8Array) => {
        const request = rawUpload(who, nonce, bytes);
        for (let i = 0; i < bytes.length && request.isOpen(); i += 100_000) {
          await request.send(bytes.subarray(i, i + 100_000));
        }
        request.end();
        return request.reply;
      };
      const first = await ready();
      const ok = await send(first.author, first.nonce, at);
      assert.equal(ok.status, 200);
      assert.equal((await proofsOf(first.occurrenceId))[0]!.size_bytes, proofRules.maxBytes);

      const second = await ready();
      const no = await send(second.author, second.nonce, over);
      assert.equal(no.status, 413);
      assert.deepEqual(no.body, { error: 'proof_too_large' });
      await assertUntouched(second.occurrenceId);
    });

    test(
      `a body that stops arriving is given up at ${proofDefaults.uploadTimeoutSeconds} seconds`,
      { timeout: 90_000 },
      async () => {
        const { author, occurrenceId, nonce } = await ready();
        const bytes = photo();
        const request = rawUpload(author, nonce, bytes);
        await request.send(bytes.subarray(0, 100));
        // Nothing more arrives for longer than the time limit. A function without the limit would still
        // be waiting, and would then read the end of the body as a short, invalid file (415).
        await sleep((proofDefaults.uploadTimeoutSeconds + 3) * 1000);
        assert.notEqual(usedAt(nonce), null);
        await request.send(bytes.subarray(100));
        request.end();
        const res = await request.reply;
        assert.equal(res.status, 408);
        assert.deepEqual(res.body, { error: 'upload_timeout' });
        await assertUntouched(occurrenceId);
      },
    );
  });

  describe('the bytes are a whole JPEG of an allowed size', () => {
    test('PNG and HTML under a JPEG Content-Type are refused, and each attempt spends its nonce', async () => {
      const png = Uint8Array.from([
        0x89,
        0x50,
        0x4e,
        0x47,
        0x0d,
        0x0a,
        0x1a,
        0x0a,
        ...new Array(600).fill(7),
      ]);
      const html = new TextEncoder().encode('<html><script>alert(1)</script></html>'.repeat(30));
      for (const [name, bytes] of [
        ['png', png],
        ['html', html],
        ['empty', new Uint8Array(0)],
      ] as const) {
        const { author, occurrenceId, nonce } = await ready();
        const res = await upload(author, nonce, bytes);
        assert.equal(res.status, 415, name);
        assert.deepEqual(res.body, { error: 'proof_bad_type' }, name);
        assert.notEqual(usedAt(nonce), null, name);
        await assertUntouched(occurrenceId);
      }
    });

    test('a JPEG cut short, or with something after the end, is refused', async () => {
      const whole = photo();
      const cases: [string, Uint8Array][] = [
        ['without the final marker', whole.subarray(0, whole.length - 2)],
        ['cut in the middle', whole.subarray(0, 200)],
        ['with trailing bytes', Uint8Array.from([...whole, 0, 0, 0])],
        ['a header and nothing else', whole.subarray(0, 4)],
      ];
      for (const [name, bytes] of cases) {
        const { author, occurrenceId, nonce } = await ready();
        const res = await upload(author, nonce, bytes);
        assert.equal(res.status, 415, name);
        assert.deepEqual(res.body, { error: 'proof_bad_type' }, name);
        await assertUntouched(occurrenceId);
      }
      const { author, nonce } = await ready();
      assert.equal((await upload(author, nonce, whole)).status, 200);
    });

    test('sizes outside 320 to 2048 on either edge are refused, whatever the header claims', async () => {
      const huge = photo();
      const at = huge.findIndex((b, i) => b === 0xff && huge[i + 1] === 0xc0);
      huge.set([0xff, 0xff, 0xff, 0xff], at + 5);
      const cases: [string, Uint8Array][] = [
        ['1x1', photo(1, 1)],
        ['319 wide', photo(319, 640)],
        ['319 high', photo(640, 319)],
        ['2049 wide', photo(2049, 640)],
        ['2049 high', photo(640, 2049)],
        ['a header of 65535x65535', huge],
      ];
      for (const [name, bytes] of cases) {
        const { author, occurrenceId, nonce } = await ready();
        const res = await upload(author, nonce, bytes);
        assert.equal(res.status, 422, name);
        assert.deepEqual(res.body, { error: 'proof_bad_dimensions' }, name);
        await assertUntouched(occurrenceId);
      }
    });
  });

  describe("the hash is the server's", () => {
    test('a hash that does not match the bytes stores nothing, and the next attempt works', async () => {
      const { author, occurrenceId, nonce } = await ready();
      const bytes = photo();
      const res = await upload(author, nonce, bytes, { meta: { sha256: sha256Hex(photo()) } });
      assert.equal(res.status, 422);
      assert.deepEqual(res.body, { error: 'proof_hash_mismatch' });
      assert.notEqual(usedAt(nonce), null);
      await assertUntouched(occurrenceId);

      const next = await challenge(author, occurrenceId);
      assert.equal((await upload(author, next, bytes)).status, 200);
    });

    test('the same bytes in a second challenge are a duplicate, even on another occurrence', async () => {
      const first = await ready();
      const bytes = photo();
      assert.equal((await upload(first.author, first.nonce, bytes)).status, 200);

      const second = await newOccurrence(group, first.author);
      const nonce = await challenge(first.author, second.occurrenceId);
      const res = await upload(first.author, nonce, bytes);
      assert.equal(res.status, 409);
      assert.deepEqual(res.body, { error: 'proof_duplicate' });
      await assertUntouched(second.occurrenceId);

      const next = await challenge(first.author, second.occurrenceId);
      assert.equal((await upload(first.author, next, photo())).status, 200);
    });
  });

  describe('the place, with the coordinates dropped', () => {
    // 1 degree of latitude is 111195 m: these are metres north of the place.
    const north = (metres: number) => PLACE.lat + metres / 111_195;
    const reading = (metres: number, accuracyM = 10) => ({
      lat: Number(north(metres).toFixed(6)),
      lng: PLACE.lng,
      accuracyM,
    });

    test('inside the radius: no flag, a distance and a precision', async () => {
      const { author, occurrenceId, nonce } = await ready({ place: true });
      const res = await upload(author, nonce, photo(), { meta: { location: reading(100) } });
      assert.equal(res.status, 200);
      assert.deepEqual(res.body.flags, []);
      const [proof] = await proofsOf(occurrenceId);
      assert.ok(proof.distance_m >= 90 && proof.distance_m <= 800, `${proof.distance_m}`);
      assert.equal(proof.accuracy_m, 10);
    });

    test('outside the radius: flagged, kept, still green; the coordinates are nowhere', async () => {
      const { author, occurrenceId, nonce } = await ready({ place: true });
      const where = { lat: -23.541234, lng: -46.629876, accuracyM: 8 };
      const res = await upload(author, nonce, photo(), { meta: { location: where } });
      assert.equal(res.status, 200);
      assert.deepEqual(res.body.flags, ['out_of_radius']);
      assert.equal((await occurrenceRow(occurrenceId)).status, 'done');
      const [proof] = await proofsOf(occurrenceId);
      assert.ok(proof.distance_m > 900 && proof.distance_m < 1100, `${proof.distance_m}`);
      assert.deepEqual(proof.flags, ['out_of_radius']);
      const everything =
        JSON.stringify(proof) +
        sql(`select to_json(p)::text from public.task_proofs p where id = '${proof.id}'`).join('');
      for (const secret of ['23.541234', '46.629876', '541234', '629876']) {
        assert.ok(!everything.includes(secret), `the row holds ${secret}`);
      }
      assert.equal(proof.accuracy_m, 8);
    });

    test('the imprecision favours the user', async () => {
      // 300 m away with 190 m of error: 110 m is inside 150.
      const near = await ready({ place: true });
      const ok = await upload(near.author, near.nonce, photo(), {
        meta: { location: reading(300, 190) },
      });
      assert.deepEqual(ok.body.flags, []);
      // Same distance with 10 m of error is outside.
      const far = await ready({ place: true });
      const out = await upload(far.author, far.nonce, photo(), {
        meta: { location: reading(300, 10) },
      });
      assert.deepEqual(out.body.flags, ['out_of_radius']);
    });

    test('no reading, or one worse than 200 m, is location_missing and not a block', async () => {
      const none = await ready({ place: true });
      const a = await upload(none.author, none.nonce, photo(), { meta: { location: null } });
      assert.equal(a.status, 200);
      assert.deepEqual(a.body.flags, ['location_missing']);
      const [pa] = await proofsOf(none.occurrenceId);
      assert.equal(pa.distance_m, null);
      assert.equal(pa.accuracy_m, null);

      const poor = await ready({ place: true });
      const b = await upload(poor.author, poor.nonce, photo(), {
        meta: { location: reading(0, 201) },
      });
      assert.equal(b.status, 200);
      assert.deepEqual(b.body.flags, ['location_missing']);
      const [pb] = await proofsOf(poor.occurrenceId);
      assert.equal(pb.distance_m, null);

      const edge = await ready({ place: true });
      const c = await upload(edge.author, edge.nonce, photo(), {
        meta: { location: reading(0, 200) },
      });
      assert.deepEqual(c.body.flags, []);
    });

    test('a context with no place ignores what the client claims', async () => {
      const { author, occurrenceId, nonce } = await ready();
      const res = await upload(author, nonce, photo(), { meta: { location: reading(5000) } });
      assert.equal(res.status, 200);
      assert.deepEqual(res.body.flags, []);
      const [proof] = await proofsOf(occurrenceId);
      assert.equal(proof.distance_m, null);
      assert.equal(proof.accuracy_m, null);
    });
  });

  describe('the clock of the device', () => {
    test('ten minutes ahead or behind is flagged and accepted; a minute is not', async () => {
      const cases: [string, number, string[]][] = [
        ['ten minutes ahead', 10 * 60_000, ['clock_mismatch']],
        ['ten minutes behind', -10 * 60_000, ['clock_mismatch']],
        ['a minute ahead', 60_000, []],
        ['on time', 0, []],
      ];
      for (const [name, offset, flags] of cases) {
        const { author, occurrenceId, nonce } = await ready();
        const res = await upload(author, nonce, photo(), {
          meta: { capturedAtDevice: new Date(Date.now() + offset).toISOString() },
        });
        assert.equal(res.status, 200, name);
        assert.deepEqual(res.body.flags, flags, name);
        const [proof] = await proofsOf(occurrenceId);
        // received_at minus the device time: the server's time, not the transfer's.
        assert.ok(
          Math.abs(proof.clock_delta_seconds + offset / 1000) < 15,
          `${name}: ${proof.clock_delta_seconds}`,
        );
      }
    });
  });

  describe('everything can change while the photo is on its way', () => {
    /** Yellow and back: a reopen, which discards every challenge issued before it. */
    async function reopen(author: Person, occurrenceId: string) {
      const yellow = await author.client.rpc('set_occurrence_status', {
        p_occurrence_id: occurrenceId,
        p_to_status: 'partial',
        p_expected_status: 'pending',
        p_reason: null,
      });
      assert.ifError(yellow.error);
      const back = await author.client.rpc('set_occurrence_status', {
        p_occurrence_id: occurrenceId,
        p_to_status: 'pending',
        p_expected_status: 'partial',
        p_reason: null,
      });
      assert.ifError(back.error);
    }

    /**
     * Sends the first bytes, waits until the function has spent the nonce (so it is between the claim
     * and the commit), runs `change`, and then sends the rest.
     */
    async function sendWhile(
      author: Person,
      nonce: string,
      bytes: Uint8Array,
      change: () => Promise<void>,
    ) {
      const request = rawUpload(author, nonce, bytes);
      await request.send(bytes.subarray(0, 200));
      for (let i = 0; i < 100 && usedAt(nonce) === null; i += 1) await sleep(50);
      assert.notEqual(usedAt(nonce), null, 'the function never claimed the nonce');
      await change();
      await request.send(bytes.subarray(200));
      request.end();
      return request.reply;
    }

    test('reopened before the upload: the old nonce is refused and stays unspent', async () => {
      const { author, occurrenceId, nonce } = await ready();
      await sleep(50);
      await reopen(author, occurrenceId);

      const res = await upload(author, nonce, photo());
      assert.equal(res.status, 409);
      assert.deepEqual(res.body, { error: 'challenge_invalid' });
      assert.equal(usedAt(nonce), null);
      await assertUntouched(occurrenceId);

      const fresh = await challenge(author, occurrenceId);
      assert.equal((await upload(author, fresh, photo())).status, 200);
    });

    test('reopened while the body is arriving: the object that was written is removed and the occurrence stays open', async () => {
      const { author, occurrenceId, nonce } = await ready();
      const bytes = photo();
      const res = await sendWhile(author, nonce, bytes, () => reopen(author, occurrenceId));
      assert.equal(res.status, 409);
      assert.deepEqual(res.body, { error: 'challenge_invalid' });
      // The commit failed after the upload: nothing may be left green, and the photo is gone.
      await assertUntouched(occurrenceId);

      const fresh = await challenge(author, occurrenceId);
      assert.equal((await upload(author, fresh, photo())).status, 200);
    });

    test('the task archived while the body is arriving: forbidden, and no object', async () => {
      const { author, occurrenceId, taskId, nonce } = await ready();
      const bytes = photo();
      const res = await sendWhile(author, nonce, bytes, async () => {
        const archived = await admin
          .from('tasks')
          .update({ archived_at: new Date().toISOString() })
          .eq('id', taskId);
        assert.ifError(archived.error);
      });
      assert.equal(res.status, 403);
      assert.deepEqual(res.body, { error: 'forbidden' });
      assert.deepEqual(await objectsOf(occurrenceId), []);
      assert.deepEqual(await proofsOf(occurrenceId), []);
    });

    test('an occurrence that is no longer open refuses the claim before any body is read', async () => {
      const { author, occurrenceId, nonce } = await ready();
      const other = await challenge(author, occurrenceId);
      assert.equal((await upload(author, nonce, photo())).status, 200);

      const res = await upload(author, other, photo());
      assert.equal(res.status, 409);
      assert.deepEqual(res.body, { error: 'occurrence_not_open' });
      // The claim was rolled back with the refusal: the nonce is still unspent.
      assert.equal(usedAt(other), null);
    });

    test('a storage that refuses leaves the occurrence as it was', async () => {
      const { author, occurrenceId, nonce } = await ready();
      // The object is already there, so the upload (upsert false) fails as a down storage would.
      const planted = await admin.storage
        .from('task-proofs')
        .upload(`${occurrenceId}/${nonce}.jpg`, photo(), { contentType: 'image/jpeg' });
      assert.ifError(planted.error);

      const res = await upload(author, nonce, photo());
      assert.equal(res.status, 500);
      assert.deepEqual(res.body, { error: 'internal' });
      const row = await occurrenceRow(occurrenceId);
      assert.equal(row.status, 'pending');
      assert.deepEqual(await proofsOf(occurrenceId), []);

      const fresh = await challenge(author, occurrenceId);
      assert.equal((await upload(author, fresh, photo())).status, 200);
    });
  });

  describe('the client cannot write the bucket', () => {
    test('upload, overwrite, delete, signed upload URL and listing are all refused to a user and to anon', async () => {
      const { author, occurrenceId, nonce } = await ready();
      assert.equal((await upload(author, nonce, photo())).status, 200);
      const path = `${occurrenceId}/${nonce}.jpg`;
      const mine = author.client.storage.from('task-proofs');
      const bytes = photo();

      for (const [who, bucket] of [
        ['user', mine],
        ['anon', anon.storage.from('task-proofs')],
      ] as const) {
        const planted = await bucket.upload(`${occurrenceId}/planted.jpg`, bytes, {
          contentType: 'image/jpeg',
        });
        assert.equal(planted.data, null, `${who} uploaded`);
        assert.match(
          planted.error!.message,
          /row-level security|not authorized|Unauthorized/i,
          who,
        );

        const overwritten = await bucket.upload(path, bytes, {
          contentType: 'image/jpeg',
          upsert: true,
        });
        assert.equal(overwritten.data, null, `${who} overwrote`);

        const signedUpload = await bucket.createSignedUploadUrl(`${occurrenceId}/signed.jpg`);
        assert.equal(signedUpload.data, null, `${who} got an upload URL`);

        const signedRead = await bucket.createSignedUrl(path, 600);
        assert.equal(signedRead.data, null, `${who} signed a read URL`);

        const download = await bucket.download(path);
        assert.equal(download.data, null, `${who} downloaded`);

        const removed = await bucket.remove([path]);
        assert.deepEqual(removed.data, [], `${who} deleted`);

        const listed = await bucket.list(occurrenceId);
        assert.deepEqual(listed.data, [], `${who} listed`);
      }
      // Nothing changed, and the service role still sees its object.
      assert.deepEqual(await objectsOf(occurrenceId), [`${nonce}.jpg`]);
      const [proof] = await proofsOf(occurrenceId);
      const intact = await admin.storage.from('task-proofs').download(path);
      assert.equal(sha256Hex(new Uint8Array(await intact.data!.arrayBuffer())), proof.sha256);
    });
  });

  describe('logs', () => {
    test('the logs of the function carry no nonce, hash, coordinates or path', async () => {
      const { author, occurrenceId, nonce } = await ready({ place: true });
      const bytes = photo();
      const where = { lat: -23.558811, lng: -46.631177, accuracyM: 12 };
      assert.equal((await upload(author, nonce, bytes, { meta: { location: where } })).status, 200);
      // And a refusal, which logs too.
      const bad = await ready({ place: true });
      assert.equal(
        (await upload(bad.author, bad.nonce, bytes.subarray(0, 50), { meta: { location: where } }))
          .status,
        415,
      );
      await sleep(1500);

      // The runtime writes the console of the function to the container's stderr.
      const read = spawnSync(
        'docker',
        [
          'logs',
          '--since',
          '5m',
          `supabase_edge_runtime_${process.env.COMPOSE_PROJECT ?? 'azkaban'}`,
        ],
        { maxBuffer: 64 * 1024 * 1024 },
      );
      const logs = `${read.stdout}${read.stderr}`;
      assert.match(
        logs,
        /proof_committed/,
        'the success line is missing, so this test reads nothing',
      );
      assert.match(logs, /proof_refused/);
      for (const secret of [
        nonce,
        bad.nonce,
        sha256Hex(bytes),
        occurrenceId,
        author.id,
        '23.558811',
        '46.631177',
        '558811',
        '631177',
        'task-proofs/',
      ]) {
        assert.ok(!logs.includes(secret), `a log line holds ${secret.slice(0, 8)}...`);
      }
    });
  });
});

/** The anon key of the local stack, as an app would hold it. */
async function anonToken() {
  return (
    process.env.SUPABASE_ANON_KEY ??
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'
  );
}
