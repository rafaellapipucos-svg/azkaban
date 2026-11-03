// Integration check of the real account-delete against the local stack (ADR-0012, section 3). Setup
// and warnings: _shared/proof-kit.ts. The tests run in order: the last ones delete the account that
// the first ones prepared. The handler's own checks: _shared/account.test.ts.
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { createClient } from '@supabase/supabase-js';
import { privacyDefaults } from '../../../packages/config/src/limits.ts';
import {
  ANON,
  API,
  admin,
  challenge,
  cleanUp,
  functionUrl,
  mint,
  newAuthor,
  newGroup,
  newOccurrence,
  objectsOf,
  options,
  sleep,
  sql,
  upload,
  type Group,
  type Person,
} from '../_shared/proof-kit.ts';
import { makeJpeg } from '../proof-validate/jpeg-fixture.ts';

const URL = functionUrl('account-delete');
const ask = async (token: string, body: unknown) => {
  const response = await fetch(URL, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify(body),
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

const claims = (token: string) =>
  JSON.parse(Buffer.from(token.split('.')[1]!, 'base64url').toString()) as {
    amr?: { method: string; timestamp: number }[];
    session_id?: string;
  };
const tokenOf = (person: Person) => person.bearer.authorization!.slice('Bearer '.length);
const nowSeconds = () => Math.floor(Date.now() / 1000);
const count = (statement: string) => Number(sql(statement)[0]);

describe('account-delete', () => {
  let group: Group;
  let leaving: Person;
  let token: string;
  let soloGroupId: string;
  let occurrenceId: string;
  let peerOccurrenceId: string;

  before(async () => {
    group = await newGroup();
    // The only real sign-in of the file: the amr of GoTrue is what is being checked.
    leaving = await newAuthor(group, { signIn: true });
    token = tokenOf(leaving);

    ({ occurrenceId } = await newOccurrence(group, leaving));
    const nonce = await challenge(leaving, occurrenceId);
    const sent = await upload(
      leaving,
      nonce,
      makeJpeg({ widthPx: 640, heightPx: 480, salt: `delete-${process.pid}-${Date.now()}` }),
    );
    assert.equal(sent.status, 200);
    assert.equal((await objectsOf(occurrenceId)).length, 1);

    // Someone else's work in the same group, which must survive.
    ({ occurrenceId: peerOccurrenceId } = await newOccurrence(group, group.peer));

    const solo = await admin
      .from('groups')
      .insert({ name: 'just me', type: 'family', owner_id: leaving.id })
      .select('id')
      .single();
    assert.ifError(solo.error);
    soloGroupId = solo.data!.id;
  });
  after(async () => {
    await cleanUp([group]);
  });

  test('GoTrue puts a timestamp in amr, writes the sign-in to its audit log, and a refresh keeps the timestamp', async () => {
    const signedIn = claims(token).amr?.[0]?.timestamp;
    assert.equal(typeof signedIn, 'number');
    assert.ok(Math.abs(nowSeconds() - signedIn!) < 120, `${signedIn}`);
    // The format complete_account_deletion deletes by.
    assert.ok(
      count(
        `select count(*) from auth.audit_log_entries where payload ->> 'actor_id' = '${leaving.id}'`,
      ) > 0,
    );

    await sleep(1100);
    const refreshed = await createClient(API, ANON, options).auth.refreshSession({
      refresh_token: leaving.refreshToken!,
    });
    assert.ifError(refreshed.error);
    const next = refreshed.data.session!.access_token;
    assert.notEqual(next, token);
    assert.equal(claims(next).amr?.[0]?.timestamp, signedIn);
    assert.equal(claims(next).session_id, claims(token).session_id);
    token = next;
  });

  test('a token without amr, or with a sign-in older than the limit, is reauth_required', async () => {
    const stale = nowSeconds() - privacyDefaults.reauthMaxAgeMinutes * 60 - 30;
    for (const old of [
      mint(leaving.id),
      mint(leaving.id, { amr: [{ method: 'password', timestamp: stale }] }),
    ]) {
      for (const dryRun of [true, false]) {
        assert.deepEqual(await ask(old, { dryRun }), {
          status: 401,
          body: { error: 'reauth_required' },
        });
      }
    }
    assert.equal(count(`select count(*) from public.profiles where id = '${leaving.id}'`), 1);
    assert.equal(
      count(`select count(*) from public.account_deletions where user_id = '${leaving.id}'`),
      0,
    );
  });

  test('without a user, or with a body out of shape, nothing happens', async () => {
    assert.equal((await ask(ANON, { dryRun: true })).status, 401);
    for (const body of [{}, { dryRun: 'no' }, { dryRun: false, extra: 1 }]) {
      assert.deepEqual(await ask(token, body), { status: 400, body: { error: 'invalid_request' } });
    }
  });

  test('dryRun shows the solo group and deletes nothing', async () => {
    assert.deepEqual(await ask(token, { dryRun: true }), {
      status: 200,
      body: { blockingGroups: [], soloGroups: [{ id: soloGroupId, name: 'just me' }] },
    });
    assert.equal(count(`select count(*) from public.groups where id = '${soloGroupId}'`), 1);
    assert.equal((await objectsOf(occurrenceId)).length, 1);
  });

  test('the owner of a group with other members is refused with the preview, and keeps everything', async () => {
    const owner = mint(group.owner.id, { amr: [{ method: 'password', timestamp: nowSeconds() }] });
    const res = await ask(owner, { dryRun: false });
    assert.equal(res.status, 409);
    assert.equal(res.body.error, 'owns_groups');
    const blocking = res.body.preview.blockingGroups.find((g: { id: string }) => g.id === group.id);
    assert.ok(blocking && blocking.memberCount >= 3, JSON.stringify(res.body.preview));
    assert.equal(count(`select count(*) from public.groups where id = '${group.id}'`), 1);
    assert.ok((await admin.auth.admin.getUserById(group.owner.id)).data.user);
    assert.equal(
      count(`select count(*) from public.account_deletions where user_id = '${group.owner.id}'`),
      0,
    );
  });

  test('after a failure midway (begin, Storage and finish done, the function gone), a repeat finishes', async () => {
    // What a function that died before deleteUser leaves behind.
    const begun = await admin.rpc('begin_account_deletion', { p_user: leaving.id });
    assert.ifError(begun.error);
    assert.equal(begun.data.storagePaths.length, 1);
    const removed = await admin.storage.from('task-proofs').remove(begun.data.storagePaths);
    assert.ifError(removed.error);
    const finished = await admin.rpc('finish_account_deletion', {
      p_user: leaving.id,
      p_objects_deleted: removed.data!.length,
    });
    assert.ifError(finished.error);

    assert.deepEqual(await ask(token, { dryRun: false }), {
      status: 200,
      body: { deleted: true },
    });
  });

  test('the account is really gone: Auth, rows, photos and the audit log; the others are intact', async () => {
    const user = await admin.auth.admin.getUserById(leaving.id);
    assert.equal(user.data.user, null);
    for (const [table, column] of [
      ['profiles', 'id'],
      ['group_members', 'user_id'],
      ['task_proofs', 'user_id'],
      ['task_occurrences', 'assignee_id'],
      ['proof_consents', 'user_id'],
      ['xp_events', 'user_id'],
      ['groups', 'owner_id'],
    ]) {
      assert.equal(
        count(`select count(*) from public.${table} where ${column} = '${leaving.id}'`),
        0,
        table,
      );
    }
    assert.equal(count(`select count(*) from public.groups where id = '${soloGroupId}'`), 0);
    assert.deepEqual(await objectsOf(occurrenceId), []);
    assert.equal(
      count(
        `select count(*) from auth.audit_log_entries where payload::text like '%${leaving.id}%'`,
      ),
      0,
    );

    // One audit row, closed, with the counts of the manual steps plus the function's.
    const [row] = sql(
      `select concat_ws(',', (completed_at is not null)::text, groups_deleted, proofs_deleted, objects_deleted)
       from public.account_deletions where user_id = '${leaving.id}'`,
    );
    assert.equal(row, 'true,1,1,1');

    assert.equal(count(`select count(*) from public.groups where id = '${group.id}'`), 1);
    assert.equal(
      count(`select count(*) from public.task_occurrences where id = '${peerOccurrenceId}'`),
      1,
    );

    // The token of the account opens nothing now, here or in the export.
    assert.equal((await ask(token, { dryRun: false })).status, 401);
    const exported = await fetch(functionUrl('account-export'), {
      method: 'POST',
      headers: { authorization: `Bearer ${token}` },
    });
    assert.equal(exported.status, 401);
  });
});
