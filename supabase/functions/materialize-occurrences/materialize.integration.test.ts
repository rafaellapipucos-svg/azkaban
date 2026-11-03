// Integration check of the real Edge Function against the local stack (ADR-0005, section 7).
//
//   pnpm db:start
//   cp supabase/functions/.env.example supabase/functions/.env     # once; ignored by git
//   pnpm exec supabase functions serve                             # leave it running
//   pnpm functions:test                                            # another terminal
//
// Do not edit files under supabase/functions while `functions serve` runs: it restarts the runtime
// and the next call gets a 502. One test needs `docker exec` into the local database container
// (DB_CONTAINER, default from supabase/config.toml) to create legacy rows that the API cannot.
//
// Everything is created under unique ids in the local database and removed at the end. The keys
// below are the universal demo keys of every local Supabase stack, not secrets. Dates are relative
// to now, with a margin of at least a day from any window edge, except the DST test, which is fixed.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { apiUrl as API, dbContainer as DB_CONTAINER } from '../_shared/local-stack.mjs';

const ANON =
  process.env.SUPABASE_ANON_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';
const SERVICE =
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';
const CRON_SECRET = process.env.CRON_SECRET ?? 'local-demo-cron-secret';
const FUNCTION_URL = `${API}/functions/v1/materialize-occurrences`;

const DAY = 86_400_000;
// Mirrors packages/config taskDefaults, which Node cannot import (extensionless imports). If the
// numbers drift, the counts asserted below fail.
const taskDefaults = { window: 60, onDemandMaxDays: 366 };
const options = { auth: { persistSession: false, autoRefreshToken: false } };
const admin: SupabaseClient = createClient(API, SERVICE, options);

type Reply = { status: number; body: Record<string, unknown> };
async function call(headers: Record<string, string>, body?: unknown): Promise<Reply> {
  const response = await fetch(FUNCTION_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: typeof body === 'string' ? body : body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: response.status, body: (await response.json()) as Record<string, unknown> };
}

type Person = { id: string; client: SupabaseClient; bearer: Record<string, string> };
async function newPerson(name: string): Promise<Person> {
  const email = `${name}-${randomUUID()}@example.com`;
  const password = randomUUID();
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  assert.ifError(error);
  const client = createClient(API, ANON, options);
  const signedIn = await client.auth.signInWithPassword({ email, password });
  assert.ifError(signedIn.error);
  return {
    id: data.user!.id,
    client,
    bearer: { authorization: `Bearer ${signedIn.data.session!.access_token}` },
  };
}

// Only for the legacy-row test, which needs DDL that the API cannot do.
const sql = (statement: string) =>
  execFileSync(
    'docker',
    [
      'exec',
      '-i',
      DB_CONTAINER,
      'psql',
      '-U',
      'postgres',
      '-v',
      'ON_ERROR_STOP=1',
      '-c',
      statement,
    ],
    { stdio: 'pipe' },
  );

const cron = { 'x-cron-secret': CRON_SECRET };
const iso = (ms: number) => new Date(ms).toISOString();
/** 12:00 UTC, `days` from today. */
const noon = (days: number) => Math.floor(Date.now() / DAY) * DAY + 12 * 3_600_000 + days * DAY;
/** Instants `anchor + k * step` that fall before `now + days`. */
const series = (anchor: number, stepDays: number, days: number) => {
  const found: string[] = [];
  for (let at = anchor; at < Date.now() + days * DAY; at += stepDays * DAY) found.push(iso(at));
  return found;
};

describe('materialize-occurrences', () => {
  let owner: Person;
  let member: Person;
  let formerMember: Person;
  let groupId: string;
  let contextId: string;
  let personalContextId: string;

  type NewTask = {
    start: number | string;
    rrule?: string | null;
    assignee?: Person;
    exdates?: string[];
    timezone?: string;
    visibility?: 'group' | 'private';
    context?: string;
  };
  async function createTask(task: NewTask): Promise<string> {
    const assignee = task.assignee ?? owner;
    const { data, error } = await admin
      .from('tasks')
      .insert({
        context_id: task.context ?? contextId,
        created_by: owner.id,
        assignee_id: assignee.id,
        title: 'materialize check',
        schedule_type: 'timed',
        start_at: typeof task.start === 'string' ? task.start : iso(task.start),
        duration_min: 30,
        timezone: task.timezone ?? 'UTC',
        // The column only takes what the app writes (tasks_rrule_grammar_check): weekly needs BYDAY.
        rrule:
          task.rrule === undefined
            ? `FREQ=WEEKLY;BYDAY=${weekday(typeof task.start === 'string' ? Date.parse(task.start) : task.start)}`
            : task.rrule,
        exdates: task.exdates ?? [],
        reminders: [],
        requires_photo_proof: false,
        requires_admin_approval: false,
        requires_partial_reason: false,
        difficulty: 'easy',
        priority: 'normal',
        visibility: task.visibility ?? 'group',
      })
      .select('id')
      .single();
    assert.ifError(error);
    return data!.id as string;
  }
  async function starts(taskId: string): Promise<string[]> {
    const { data, error } = await admin
      .from('task_occurrences')
      .select('scheduled_start')
      .eq('task_id', taskId)
      .order('scheduled_start');
    assert.ifError(error);
    return data!.map((row) => iso(Date.parse(row.scheduled_start as string)));
  }
  async function cursor(taskId: string): Promise<number | null> {
    const { data, error } = await admin
      .from('tasks')
      .select('materialized_until')
      .eq('id', taskId)
      .single();
    assert.ifError(error);
    return data!.materialized_until ? Date.parse(data!.materialized_until as string) : null;
  }
  /** `BYDAY` of a UTC instant, so a weekly rule matches its own anchor. */
  const weekday = (ms: number) =>
    ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'][new Date(ms).getUTCDay()];

  before(async () => {
    owner = await newPerson('owner');
    member = await newPerson('member');
    formerMember = await newPerson('former');
    const group = await admin
      .from('groups')
      .insert({ name: 'materialize check', type: 'family', owner_id: owner.id })
      .select('id')
      .single();
    assert.ifError(group.error);
    groupId = group.data!.id as string;
    const joined = await admin.from('group_members').insert([
      { group_id: groupId, user_id: member.id, role: 'member' },
      { group_id: groupId, user_id: formerMember.id, role: 'member' },
    ]);
    assert.ifError(joined.error);
    const area = await admin.from('areas').select('id').limit(1).single();
    assert.ifError(area.error);
    const contexts = await admin
      .from('contexts')
      .insert([
        {
          area_id: area.data!.id,
          group_id: groupId,
          name: 'g',
          color_token: 'x',
          icon: 'x',
          created_by: owner.id,
        },
        {
          area_id: area.data!.id,
          owner_user_id: owner.id,
          name: 'p',
          color_token: 'x',
          icon: 'x',
          created_by: owner.id,
        },
      ])
      .select('id, group_id');
    assert.ifError(contexts.error);
    contextId = contexts.data!.find((c) => c.group_id)!.id as string;
    personalContextId = contexts.data!.find((c) => !c.group_id)!.id as string;
  });

  after(async () => {
    await admin.from('groups').delete().eq('id', groupId);
    await admin.from('contexts').delete().eq('id', personalContextId);
    for (const person of [owner, member, formerMember]) {
      if (person) await admin.auth.admin.deleteUser(person.id);
    }
  });

  test('a weekly task gets its occurrences across the window, and a second run adds nothing', async () => {
    const anchor = noon(1);
    const taskId = await createTask({ start: anchor });
    const expected = series(anchor, 7, taskDefaults.window);
    assert.equal(expected.length, 9);

    const first = await call(owner.bearer, { taskIds: [taskId] });
    assert.deepEqual(first, { status: 200, body: { inserted: 9, failed: 0, deferred: 0 } });
    assert.deepEqual(await starts(taskId), expected);
    const until = await cursor(taskId);
    assert.ok(Math.abs(until! - (Date.now() + taskDefaults.window * DAY)) < 120_000);

    const second = await call(owner.bearer, { taskIds: [taskId] });
    assert.deepEqual(second, { status: 200, body: { inserted: 0, failed: 0, deferred: 0 } });
    assert.deepEqual(await starts(taskId), expected);
  });

  test('a day in exdates is not created, and the same task without it is', async () => {
    const anchor = noon(1);
    const plain = await createTask({ start: anchor, timezone: 'America/Sao_Paulo' });
    const skipped = new Date(anchor + 14 * DAY).toISOString().slice(0, 10);
    const withDay = await createTask({
      start: anchor,
      timezone: 'America/Sao_Paulo',
      exdates: [skipped],
    });

    const res = await call(owner.bearer, { taskIds: [plain, withDay] });
    assert.deepEqual(res, { status: 200, body: { inserted: 17, failed: 0, deferred: 0 } });
    const all = series(anchor, 7, taskDefaults.window);
    assert.deepEqual(await starts(plain), all);
    assert.deepEqual(
      await starts(withDay),
      all.filter((at) => at !== iso(anchor + 14 * DAY)),
    );
  });

  test('a task deleted with all is skipped, and its sibling still extends', async () => {
    const anchor = noon(1);
    const doomed = await createTask({ start: anchor });
    const sibling = await createTask({ start: anchor });
    await call(owner.bearer, { taskIds: [doomed, sibling] });
    const count = (await starts(doomed)).length;
    assert.equal(count, 9);

    const { data: occurrence } = await admin
      .from('task_occurrences')
      .select('id')
      .eq('task_id', doomed)
      .order('scheduled_start')
      .limit(1)
      .single();
    const deleted = await owner.client.rpc('delete_task', {
      p_occurrence_id: occurrence!.id,
      p_scope: 'all',
      p_head_rrule: null,
    });
    assert.ifError(deleted.error);

    const expectedSibling = series(anchor, 7, 100);
    const res = await call(owner.bearer, {
      taskIds: [doomed, sibling],
      until: iso(Date.now() + 100 * DAY),
    });
    assert.deepEqual(res, {
      status: 200,
      body: { inserted: expectedSibling.length - 9, failed: 0, deferred: 0 },
    });
    assert.equal((await starts(doomed)).length, count);
    assert.deepEqual(await starts(sibling), expectedSibling);
  });

  test('occurrences of a former member are skipped, and come back with the membership', async () => {
    const anchor = noon(1);
    const stays = await createTask({ start: anchor, assignee: member });
    const left = await createTask({ start: anchor, assignee: formerMember });
    const removed = await admin
      .from('group_members')
      .delete()
      .eq('group_id', groupId)
      .eq('user_id', formerMember.id);
    assert.ifError(removed.error);

    const res = await call(owner.bearer, { taskIds: [stays, left] });
    assert.deepEqual(res, { status: 200, body: { inserted: 9, failed: 0, deferred: 0 } });
    assert.equal((await starts(stays)).length, 9);
    assert.deepEqual(await starts(left), []);
    assert.equal(await cursor(left), null);

    const back = await admin
      .from('group_members')
      .insert({ group_id: groupId, user_id: formerMember.id, role: 'member' });
    assert.ifError(back.error);
    const again = await call(owner.bearer, { taskIds: [left] });
    assert.deepEqual(again, { status: 200, body: { inserted: 9, failed: 0, deferred: 0 } });
    assert.equal((await starts(left)).length, 9);
  });

  test('a client cannot materialize a task they cannot see', async () => {
    const taskId = await createTask({ start: noon(1), visibility: 'private' });

    const blocked = await call(member.bearer, { taskIds: [taskId] });
    assert.deepEqual(blocked, { status: 200, body: { inserted: 0, failed: 0, deferred: 0 } });
    assert.deepEqual(await starts(taskId), []);
    assert.equal(await cursor(taskId), null);

    const allowed = await call(owner.bearer, { taskIds: [taskId] });
    assert.deepEqual(allowed, { status: 200, body: { inserted: 9, failed: 0, deferred: 0 } });
  });

  test('until is capped at onDemandMaxDays, and honored below it', async () => {
    const anchor = noon(4);
    const far = await createTask({ start: anchor });
    const near = await createTask({ start: anchor });

    const capped = await call(owner.bearer, {
      taskIds: [far],
      until: iso(Date.now() + 1000 * DAY),
    });
    const expectedFar = series(anchor, 7, taskDefaults.onDemandMaxDays);
    assert.equal(expectedFar.length, 52);
    assert.deepEqual(capped, { status: 200, body: { inserted: 52, failed: 0, deferred: 0 } });
    assert.deepEqual(await starts(far), expectedFar);
    const until = await cursor(far);
    assert.ok(Math.abs(until! - (Date.now() + taskDefaults.onDemandMaxDays * DAY)) < 120_000);

    const honored = await call(owner.bearer, {
      taskIds: [near],
      until: iso(Date.now() + 100 * DAY),
    });
    const expectedNear = series(anchor, 7, 100);
    assert.equal(expectedNear.length, 14);
    assert.deepEqual(honored, { status: 200, body: { inserted: 14, failed: 0, deferred: 0 } });
    assert.deepEqual(await starts(near), expectedNear);
  });

  test('a user needs authentication and a task list or until; the cron secret is checked', async () => {
    const taskId = await createTask({ start: noon(1) });

    assert.deepEqual(await call({}, { taskIds: [taskId] }), {
      status: 401,
      body: { error: 'unauthorized' },
    });
    assert.deepEqual(await call({ authorization: `Bearer ${ANON}` }, { taskIds: [taskId] }), {
      status: 401,
      body: { error: 'unauthorized' },
    });
    assert.deepEqual(await call(owner.bearer, {}), {
      status: 400,
      body: { error: 'empty_request' },
    });
    assert.deepEqual(await call(owner.bearer, { taskIds: [] }), {
      status: 400,
      body: { error: 'invalid_request' },
    });
    assert.deepEqual(await call(owner.bearer, { until: 'tomorrow' }), {
      status: 400,
      body: { error: 'invalid_request' },
    });
    assert.deepEqual(await call(owner.bearer, '{not json'), {
      status: 400,
      body: { error: 'invalid_request' },
    });
    assert.deepEqual(await starts(taskId), []);

    // Cron: a wrong secret is refused, even next to a valid JWT, and nothing is created.
    assert.deepEqual(await call({ 'x-cron-secret': `${CRON_SECRET}x` }, {}), {
      status: 401,
      body: { error: 'unauthorized' },
    });
    assert.deepEqual(await call({ 'x-cron-secret': 'wrong', ...owner.bearer }, {}), {
      status: 401,
      body: { error: 'unauthorized' },
    });
    assert.deepEqual(await starts(taskId), []);

    // The right secret with the empty body the database job sends covers every recurring task.
    const swept = await call(cron, {});
    assert.equal(swept.status, 200);
    assert.ok((swept.body.inserted as number) >= 9);
    assert.equal((await starts(taskId)).length, 9);
  });

  test('the body stops at 8 KiB: exactly that passes, one byte more does not', async () => {
    const taskId = await createTask({ start: noon(1) });
    const padded = (size: number) => JSON.stringify({ taskIds: [taskId] }).padEnd(size, ' ');
    assert.deepEqual(await call(owner.bearer, padded(8192)), {
      status: 200,
      body: { inserted: 9, failed: 0, deferred: 0 },
    });
    assert.deepEqual(await call(owner.bearer, padded(8193)), {
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
    const response = await fetch(FUNCTION_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...owner.bearer },
      body,
      // @ts-expect-error Node's fetch needs this for a stream body.
      duplex: 'half',
    });
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { error: 'invalid_request' });
    assert.equal((await call(owner.bearer, { taskIds: [randomUUID()] })).status, 200);
  });

  test('the cron call fails loudly without its Vault secrets', () => {
    // The local Vault is empty: the run would show as failed in cron.job_run_details.
    assert.throws(
      () => sql('select public.call_materialize_occurrences();'),
      (error: { stderr?: Buffer }) => /materialize_not_configured/.test(String(error.stderr)),
    );
  });

  test('this_and_following followed by materialization yields the edited series', async () => {
    const anchor = noon(1);
    const day = weekday(anchor);
    const taskId = await createTask({ start: anchor, rrule: `FREQ=WEEKLY;BYDAY=${day}` });
    await call(owner.bearer, { taskIds: [taskId] });
    const weekly = await starts(taskId);
    assert.equal(weekly.length, 9);

    // Pivot at the fourth occurrence. The head ends at the end of the day before it, as splitRecurrence builds it.
    const pivot = Date.parse(weekly[3]);
    const until = new Date(pivot - DAY).toISOString().slice(0, 10).replaceAll('-', '');
    const { data: occurrence } = await admin
      .from('task_occurrences')
      .select('id')
      .eq('task_id', taskId)
      .eq('scheduled_start', weekly[3])
      .single();
    const edited = await owner.client.rpc('edit_task', {
      p_occurrence_id: occurrence!.id,
      p_scope: 'this_and_following',
      p_task: {
        contextId,
        assigneeId: owner.id,
        title: 'every other week',
        notes: null,
        scheduleType: 'timed',
        startAt: iso(pivot),
        dueAt: null,
        durationMin: 30,
        timezone: 'UTC',
        reminders: [],
        requiresPhotoProof: false,
        requiresAdminApproval: false,
        requiresPartialReason: false,
        difficulty: 'easy',
        priority: 'normal',
        visibility: 'group',
      },
      p_rrule: `FREQ=WEEKLY;INTERVAL=2;BYDAY=${day}`,
      p_head_rrule: `FREQ=WEEKLY;BYDAY=${day};UNTIL=${until}T235959Z`,
    });
    assert.ifError(edited.error);
    const [tailId] = edited.data as string[];
    assert.ok(tailId);
    assert.deepEqual(await starts(tailId), []);

    const res = await call(owner.bearer, { taskIds: [taskId, tailId] });
    const expectedTail = series(pivot, 14, taskDefaults.window);
    assert.deepEqual(res, {
      status: 200,
      body: { inserted: expectedTail.length, failed: 0, deferred: 0 },
    });
    assert.deepEqual(await starts(taskId), weekly.slice(0, 3));
    assert.deepEqual(await starts(tailId), expectedTail);
    assert.deepEqual(await call(owner.bearer, { taskIds: [taskId, tailId] }), {
      status: 200,
      body: { inserted: 0, failed: 0, deferred: 0 },
    });
  });

  test('9am local stays 9am across the next New York DST change', async () => {
    // The next US DST start (second Sunday of March) that is at least two weeks away, so the series
    // is in the future whatever day this runs. Mondays 09:00 in New York: 14:00Z in EST, 13:00Z in EDT.
    const secondSunday = (year: number) => {
      const firstSunday = 1 + ((7 - new Date(Date.UTC(year, 2, 1)).getUTCDay()) % 7);
      return Date.UTC(year, 2, firstSunday + 7);
    };
    const thisYear = new Date().getUTCFullYear();
    const dst = [thisYear, thisYear + 1].map(secondSunday).find((d) => d - 14 * DAY > Date.now())!;
    const at = (days: number, hour: number) => iso(dst + days * DAY + hour * 3_600_000);
    const taskId = await createTask({
      start: at(-13, 14),
      rrule: 'FREQ=WEEKLY;BYDAY=MO',
      timezone: 'America/New_York',
      context: personalContextId,
      visibility: 'private',
    });
    const res = await call(owner.bearer, { taskIds: [taskId], until: at(3, 0) });
    assert.deepEqual(res, { status: 200, body: { inserted: 3, failed: 0, deferred: 0 } });
    assert.deepEqual(await starts(taskId), [at(-13, 14), at(-6, 14), at(1, 13)]);
  });

  test('a series anchored in year 2000 is created from 30 days ago, not from its anchor', async () => {
    // Daily since 2000-01-01 would be about 10 thousand rows and 300 ms of CPU for one task.
    const ancient = await createTask({ start: '2000-01-01T12:00:00Z', rrule: 'FREQ=DAILY' });
    const recent = await createTask({ start: noon(-10), rrule: 'FREQ=DAILY' });

    const res = await call(owner.bearer, { taskIds: [ancient, recent] });
    const old = await starts(ancient);
    // 30 days back and 60 ahead, one row a day; the edges move by a day with the time of day.
    assert.ok(old.length >= 90 && old.length <= 91, `ancient rows: ${old.length}`);
    assert.ok(Date.parse(old[0]) >= Date.now() - 31 * DAY, old[0]);
    assert.ok(Date.parse(old[0]) < Date.now() - 29 * DAY, old[0]);
    // The floor does not cut a series that started inside it.
    const near = await starts(recent);
    assert.equal(near[0], iso(noon(-10)));
    assert.ok(near.length >= 70 && near.length <= 71, `recent rows: ${near.length}`);
    assert.deepEqual(res, {
      status: 200,
      body: { inserted: old.length + near.length, failed: 0, deferred: 0 },
    });
  });

  test('a run stops at its budget, keeps what it finished, and the next one goes on', async () => {
    // Daily from 2000: rrule iterates 10 thousand days for each, which is what makes them costly.
    const many = 80;
    const { data: created, error } = await admin
      .from('tasks')
      .insert(
        Array.from({ length: many }, () => ({
          context_id: personalContextId,
          created_by: owner.id,
          assignee_id: owner.id,
          title: 'costly',
          schedule_type: 'timed',
          start_at: '2000-01-01T12:00:00Z',
          duration_min: 30,
          timezone: 'America/Sao_Paulo',
          rrule: 'FREQ=DAILY',
          exdates: [],
          reminders: [],
          requires_photo_proof: false,
          requires_admin_approval: false,
          requires_partial_reason: false,
          difficulty: 'easy',
          priority: 'normal',
          visibility: 'private',
        })),
      )
      .select('id');
    assert.ifError(error);
    const ids = created!.map((row) => row.id as string);
    const cursors = async () => {
      const { data } = await admin.from('tasks').select('id, materialized_until').in('id', ids);
      return new Map(
        data!.map((row) => [row.id as string, row.materialized_until as string | null]),
      );
    };

    let before = new Map<string, string | null>();
    let finished = 0;
    for (let run = 1; run <= many && finished < many; run++) {
      const res = await call(cron, {});
      assert.equal(res.status, 200, `run ${run}`);
      const deferred = res.body.deferred as number;
      const now = await cursors();
      finished = [...now.values()].filter((value) => value !== null).length;
      const before_finished = [...before.values()].filter((value) => value !== null).length;
      // Every run advances, and what an earlier run finished is still finished, never moved back.
      assert.ok(finished > before_finished, `run ${run}: ${before_finished} -> ${finished}`);
      for (const [id, value] of before) {
        if (value !== null) assert.ok(Date.parse(now.get(id)!) >= Date.parse(value));
      }
      // The first run cannot do 80 of them: it stopped at its budget with some already saved.
      if (run === 1) assert.ok(finished >= 1 && finished < many, `first run finished ${finished}`);
      // What the budget left behind is said, so the client knows to call again (ADR-0008, 12).
      assert.ok(
        deferred >= many - finished,
        `run ${run}: deferred ${deferred}, left ${many - finished}`,
      );
      assert.equal(res.body.failed, 0, `run ${run}`);
      before = now;
    }
    assert.equal(finished, many);

    // All done: nothing is stale, so a further run creates nothing and the rows are the floor's.
    assert.deepEqual(await call(cron, {}), {
      status: 200,
      body: { inserted: 0, failed: 0, deferred: 0 },
    });
    for (const id of ids.slice(0, 3)) {
      const rows = await starts(id);
      assert.ok(rows.length >= 90 && rows.length <= 91, `rows: ${rows.length}`);
    }
  });

  test('a task whose rows the database refuses is counted and skipped, and the others go on', async () => {
    // The grammar CHECK of tasks.rrule keeps rules like these out today, so both rows are legacy
    // ones: the constraint is dropped and re-added NOT VALID in one transaction, which leaves it
    // enforced for new rows and for any update of these two. Two ways for the database to refuse:
    //  - refusedInsert: BYMINUTE moves the start to 09:30 while the due moment stays 09:10, so each
    //    occurrence ends before it starts and breaks a CHECK of task_occurrences;
    //  - refusedCursor: its occurrences insert fine, but updating the task (the cursor) rechecks
    //    the grammar and fails.
    const good = await createTask({ start: noon(1) });
    const refusedInsert = randomUUID();
    const refusedCursor = randomUUID();
    const when = (hour: number, minute: number) =>
      iso(noon(1) - 12 * 3_600_000 + hour * 3_600_000 + minute * 60_000);
    const legacy = (id: string, type: 'deadline' | 'timed', rrule: string) => `
      insert into public.tasks (id, context_id, created_by, assignee_id, title, schedule_type, start_at,
        due_at, duration_min, timezone, rrule, reminders, requires_photo_proof,
        requires_admin_approval, requires_partial_reason, difficulty, priority, visibility)
      values ('${id}', '${contextId}', '${owner.id}', '${owner.id}', 'legacy', '${type}',
        '${when(9, 0)}', ${type === 'deadline' ? `'${when(9, 10)}'` : 'null'},
        ${type === 'timed' ? 30 : 'null'}, 'UTC', '${rrule}', '[]', false, false, false,
        'easy', 'normal', 'group');`;
    sql(`
      alter table public.tasks drop constraint tasks_rrule_grammar_check;
      ${legacy(refusedInsert, 'deadline', 'FREQ=DAILY;BYMINUTE=30')}
      ${legacy(refusedCursor, 'timed', 'FREQ=DAILY;WKST=MO')}
      alter table public.tasks add constraint tasks_rrule_grammar_check
        check (rrule is null or public.is_valid_rrule(rrule)) not valid;`);
    try {
      // One call with all three: the refused ones must not take the good task down with them.
      const first = await call(owner.bearer, { taskIds: [refusedInsert, refusedCursor, good] });
      const cursorRows = (await starts(refusedCursor)).length;
      assert.ok(cursorRows >= 59 && cursorRows <= 61, `daily rows: ${cursorRows}`);
      assert.deepEqual(first, {
        status: 200,
        body: { inserted: 9 + cursorRows, failed: 2, deferred: 0 },
      });
      assert.deepEqual(await starts(refusedInsert), []);
      assert.equal(await cursor(refusedInsert), null);
      assert.equal(await cursor(refusedCursor), null);
      assert.equal((await starts(good)).length, 9);
      assert.ok((await cursor(good)) !== null);

      // Retried and refused again, with nothing new, and the cron sweep survives them too.
      assert.deepEqual(
        await call(owner.bearer, { taskIds: [refusedInsert, refusedCursor, good] }),
        {
          status: 200,
          body: { inserted: 0, failed: 2, deferred: 0 },
        },
      );
      const swept = await call(cron, {});
      assert.equal(swept.status, 200);
      assert.ok((swept.body.failed as number) >= 2, `sweep failed: ${swept.body.failed}`);
      assert.deepEqual(await starts(refusedInsert), []);
    } finally {
      await admin.from('tasks').delete().in('id', [refusedInsert, refusedCursor]);
      sql('alter table public.tasks validate constraint tasks_rrule_grammar_check;');
    }
  });
});
