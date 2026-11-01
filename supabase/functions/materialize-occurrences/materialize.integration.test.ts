// Integration check of the real Edge Function against the local stack (ADR-0005, section 7).
//
//   pnpm db:start
//   cp supabase/functions/.env.example supabase/functions/.env     # once; ignored by git
//   pnpm exec supabase functions serve                             # leave it running
//   node --test supabase/functions/materialize-occurrences/materialize.integration.test.ts
//
// Everything is created under unique ids in the local database and removed at the end. The keys
// below are the universal demo keys of every local Supabase stack, not secrets. Dates are relative
// to now, with a margin of at least a day from any window edge, except the DST test, which is fixed.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const API = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54421';
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
        rrule: task.rrule === undefined ? 'FREQ=WEEKLY' : task.rrule,
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
    assert.deepEqual(first, { status: 200, body: { inserted: 9 } });
    assert.deepEqual(await starts(taskId), expected);
    const until = await cursor(taskId);
    assert.ok(Math.abs(until! - (Date.now() + taskDefaults.window * DAY)) < 120_000);

    const second = await call(owner.bearer, { taskIds: [taskId] });
    assert.deepEqual(second, { status: 200, body: { inserted: 0 } });
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
    assert.deepEqual(res, { status: 200, body: { inserted: 17 } });
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
    assert.deepEqual(res, { status: 200, body: { inserted: expectedSibling.length - 9 } });
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
    assert.deepEqual(res, { status: 200, body: { inserted: 9 } });
    assert.equal((await starts(stays)).length, 9);
    assert.deepEqual(await starts(left), []);
    assert.equal(await cursor(left), null);

    const back = await admin
      .from('group_members')
      .insert({ group_id: groupId, user_id: formerMember.id, role: 'member' });
    assert.ifError(back.error);
    const again = await call(owner.bearer, { taskIds: [left] });
    assert.deepEqual(again, { status: 200, body: { inserted: 9 } });
    assert.equal((await starts(left)).length, 9);
  });

  test('a client cannot materialize a task they cannot see', async () => {
    const taskId = await createTask({ start: noon(1), visibility: 'private' });

    const blocked = await call(member.bearer, { taskIds: [taskId] });
    assert.deepEqual(blocked, { status: 200, body: { inserted: 0 } });
    assert.deepEqual(await starts(taskId), []);
    assert.equal(await cursor(taskId), null);

    const allowed = await call(owner.bearer, { taskIds: [taskId] });
    assert.deepEqual(allowed, { status: 200, body: { inserted: 9 } });
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
    assert.deepEqual(capped, { status: 200, body: { inserted: 52 } });
    assert.deepEqual(await starts(far), expectedFar);
    const until = await cursor(far);
    assert.ok(Math.abs(until! - (Date.now() + taskDefaults.onDemandMaxDays * DAY)) < 120_000);

    const honored = await call(owner.bearer, {
      taskIds: [near],
      until: iso(Date.now() + 100 * DAY),
    });
    const expectedNear = series(anchor, 7, 100);
    assert.equal(expectedNear.length, 14);
    assert.deepEqual(honored, { status: 200, body: { inserted: 14 } });
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
    assert.deepEqual(res, { status: 200, body: { inserted: expectedTail.length } });
    assert.deepEqual(await starts(taskId), weekly.slice(0, 3));
    assert.deepEqual(await starts(tailId), expectedTail);
    assert.deepEqual(await call(owner.bearer, { taskIds: [taskId, tailId] }), {
      status: 200,
      body: { inserted: 0 },
    });
  });

  test('9am local stays 9am across the New York DST change', async () => {
    // Mondays 09:00 in New York: EST until Mar 14 2027 (14:00Z), EDT after it (13:00Z).
    const taskId = await createTask({
      start: '2027-03-01T14:00:00Z',
      rrule: 'FREQ=WEEKLY;BYDAY=MO',
      timezone: 'America/New_York',
      context: personalContextId,
      visibility: 'private',
    });
    const res = await call(owner.bearer, { taskIds: [taskId], until: '2027-03-31T00:00:00Z' });
    assert.deepEqual(res, { status: 200, body: { inserted: 5 } });
    assert.deepEqual(await starts(taskId), [
      '2027-03-01T14:00:00.000Z',
      '2027-03-08T14:00:00.000Z',
      '2027-03-15T13:00:00.000Z',
      '2027-03-22T13:00:00.000Z',
      '2027-03-29T13:00:00.000Z',
    ]);
  });
});
