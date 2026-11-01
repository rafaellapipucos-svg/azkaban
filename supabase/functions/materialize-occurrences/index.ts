// Creates the occurrences of recurring tasks (ADR-0005, section 7). Two callers:
//   - the daily cron job: header `x-cron-secret`, empty body, every recurring task;
//   - a signed-in user: JWT and `taskIds` and/or `until`, only the tasks their own RLS lets them read.
// The expansion is `expandOccurrences` from packages/core, imported through deno.json. That file
// maps the packages to the entry points this function needs, because Deno resolves neither
// extensionless relative imports nor named exports of rrule's CommonJS bundle (see rrule-shim.ts).
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { timingSafeEqual } from 'node:crypto';
import { taskDefaults } from '@azkaban/config';
import { materializeRequestSchema, materializeResponseSchema } from '@azkaban/contracts';
import { expandOccurrences, taskAnchor } from '@azkaban/core';

const DAY_MS = 86_400_000;
// Group membership is checked with one filter per task, so a page keeps that URL short.
const PAGE_SIZE = 50;
const INSERT_CHUNK = 500;

const headers = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type',
  'access-control-allow-methods': 'POST, OPTIONS',
  'content-type': 'application/json',
};
const reply = (status: number, body: unknown) =>
  new Response(status === 204 ? null : JSON.stringify(body), { status, headers });

type TaskRow = {
  id: string;
  group_id: string | null;
  assignee_id: string;
  schedule_type: 'timed' | 'all_day' | 'deadline';
  start_at: string | null;
  due_at: string | null;
  duration_min: number | null;
  timezone: string;
  rrule: string;
  exdates: string[];
  materialized_until: string | null;
};
const TASK_COLUMNS =
  'id, group_id, assignee_id, schedule_type, start_at, due_at, duration_min, timezone, rrule, exdates, materialized_until';

// Both digests have the same length, which is what timingSafeEqual needs, and the length of the
// secret does not leak.
async function sameSecret(given: string, expected: string): Promise<boolean> {
  const digest = async (text: string) =>
    new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));
  return timingSafeEqual(await digest(given), await digest(expected));
}

class DatabaseError extends Error {}
function check<T>(stage: string, result: { data: T; error: { code?: string } | null }): T {
  if (result.error) {
    // The code and the stage only: messages can quote rows.
    console.error(JSON.stringify({ event: 'materialize_failed', stage, code: result.error.code }));
    throw new DatabaseError(stage);
  }
  return result.data;
}

/** Pages of the tasks to materialize, by id. The reader decides which tasks exist for the caller. */
async function* recurringTasks(reader: SupabaseClient, taskIds: string[] | undefined) {
  let last: string | null = null;
  while (true) {
    let query = reader
      .from('tasks')
      .select(TASK_COLUMNS)
      .not('rrule', 'is', null)
      .is('archived_at', null)
      .order('id')
      .limit(PAGE_SIZE);
    if (taskIds) query = query.in('id', taskIds);
    if (last) query = query.gt('id', last);
    const page = check('read_tasks', await query) as unknown as TaskRow[];
    if (page.length === 0) return;
    yield page;
    if (page.length < PAGE_SIZE) return;
    last = page[page.length - 1].id;
  }
}

/** `group_id:user_id` of the assignees of the page that still belong to their task's group. */
async function currentMembers(admin: SupabaseClient, page: TaskRow[]): Promise<Set<string>> {
  const pairs = new Set(
    page
      .filter((t) => t.group_id)
      .map((t) => `and(group_id.eq.${t.group_id},user_id.eq.${t.assignee_id})`),
  );
  if (pairs.size === 0) return new Set();
  const rows = check(
    'read_members',
    await admin
      .from('group_members')
      .select('group_id, user_id')
      .or([...pairs].join(',')),
  );
  return new Set(rows.map((m) => `${m.group_id}:${m.user_id}`));
}

type OccurrenceRow = {
  task_id: string;
  assignee_id: string;
  scheduled_start: string;
  scheduled_due: string;
};

// SQLSTATE of a refusal of the data itself: data exception (22), integrity violation (23), RAISE
// EXCEPTION (P0001). Anything else, such as a lost connection, is the infrastructure and fails the call.
const REFUSAL = /^(22|23|P0001)/;
function refused(stage: string, error: { code?: string }): true {
  console.error(JSON.stringify({ event: 'materialize_refused', stage, code: error.code }));
  if (!REFUSAL.test(error.code ?? '')) throw new DatabaseError(stage);
  return true;
}

/** One statement. Null when the database refuses a row, and then none was inserted. */
async function insertRows(admin: SupabaseClient, rows: OccurrenceRow[]): Promise<number | null> {
  if (rows.length === 0) return 0;
  // on conflict do nothing: a repeated or overlapping run inserts nothing twice, and `select`
  // returns only the rows that were really inserted.
  const { data, error } = await admin
    .from('task_occurrences')
    .upsert(rows, { onConflict: 'task_id,scheduled_start', ignoreDuplicates: true })
    .select('id');
  return error && refused('insert_occurrences', error) ? null : data!.length;
}

/** The rows of one task, in chunks. A refusal in a later chunk keeps what the earlier ones inserted. */
async function insertTask(admin: SupabaseClient, rows: OccurrenceRow[]) {
  let inserted = 0;
  for (let i = 0; i < rows.length; i += INSERT_CHUNK) {
    const chunk = await insertRows(admin, rows.slice(i, i + INSERT_CHUNK));
    if (chunk === null) return { inserted, ok: false };
    inserted += chunk;
  }
  return { inserted, ok: true };
}

/** Moves the cursor forward only. Returns the tasks whose update the database refused. */
async function moveCursor(admin: SupabaseClient, ids: string[], limit: string): Promise<number> {
  const update = (subset: string[]) =>
    admin
      .from('tasks')
      .update({ materialized_until: limit })
      .in('id', subset)
      .or(`materialized_until.is.null,materialized_until.lt.${limit}`);
  const all = await update(ids);
  if (!all.error) return 0;
  refused('move_cursor', all.error);
  // One statement, so nothing moved. Try them apart to find which task the database refuses.
  let failed = 0;
  for (const id of ids) {
    const one = await update([id]);
    if (one.error && refused('move_cursor', one.error)) failed += 1;
  }
  return failed;
}

async function materialize(
  reader: SupabaseClient,
  admin: SupabaseClient,
  taskIds: string[] | undefined,
  limitMs: number,
) {
  const limit = new Date(limitMs).toISOString();
  const totals = { tasks: 0, formerMembers: 0, failed: 0, inserted: 0 };

  for await (const page of recurringTasks(reader, taskIds)) {
    const members = await currentMembers(admin, page);
    // The tasks of this page that have something to do, with their rows (possibly none).
    const rowsOf = new Map<string, OccurrenceRow[]>();

    for (const t of page) {
      totals.tasks += 1;
      // Left the group: nothing is created, and the cursor stays, so a new assignee gets the
      // series from where it stopped instead of from today.
      if (t.group_id && !members.has(`${t.group_id}:${t.assignee_id}`)) {
        totals.formerMembers += 1;
        continue;
      }
      try {
        const task = {
          scheduleType: t.schedule_type,
          startAt: t.start_at,
          dueAt: t.due_at,
          durationMin: t.duration_min,
          timezone: t.timezone,
          rrule: t.rrule,
          exdates: t.exdates,
        };
        const from = t.materialized_until ?? taskAnchor(task);
        if (Date.parse(from) >= limitMs) continue;
        rowsOf.set(
          t.id,
          expandOccurrences(task, from, limit).map((o) => ({
            task_id: t.id,
            assignee_id: t.assignee_id,
            scheduled_start: o.scheduledStart,
            scheduled_due: o.scheduledDue,
          })),
        );
      } catch {
        // A rule that cannot be expanded must not stop the sweep. Counted, never quoted.
        totals.failed += 1;
      }
    }

    // One statement for the page when it fits, which is all or nothing. When the database refuses
    // it, or it is too big, each task goes alone, so one task's bad row never costs the others
    // their occurrences or their cursor.
    const everything = [...rowsOf.values()].flat();
    const bulk = everything.length <= INSERT_CHUNK ? await insertRows(admin, everything) : null;
    if (bulk !== null) {
      totals.inserted += bulk;
    } else {
      for (const [id, rows] of rowsOf) {
        const result = await insertTask(admin, rows);
        totals.inserted += result.inserted;
        if (!result.ok) {
          rowsOf.delete(id);
          totals.failed += 1;
        }
      }
    }

    // Only after the insert, and only forward, so a failure in the middle is repeated safely. A
    // task that failed keeps its cursor, so the next run tries it again.
    if (rowsOf.size > 0) totals.failed += await moveCursor(admin, [...rowsOf.keys()], limit);
  }
  return totals;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return reply(204, null);
  if (req.method !== 'POST') return reply(405, { error: 'method_not_allowed' });

  try {
    const url = Deno.env.get('SUPABASE_URL')!;
    const options = { auth: { persistSession: false, autoRefreshToken: false } };
    const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, options);

    // Who is calling. A cron header that is present but wrong is refused, never a fallback to the JWT.
    const cronHeader = req.headers.get('x-cron-secret');
    const authorization = req.headers.get('authorization') ?? '';
    let reader: SupabaseClient;
    if (cronHeader !== null) {
      const expected = Deno.env.get('CRON_SECRET');
      if (!expected || !(await sameSecret(cronHeader, expected))) {
        return reply(401, { error: 'unauthorized' });
      }
      reader = admin;
    } else {
      if (!authorization.startsWith('Bearer ')) return reply(401, { error: 'unauthorized' });
      reader = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
        ...options,
        global: { headers: { Authorization: authorization } },
      });
      const { data, error } = await reader.auth.getUser(authorization.slice(7));
      if (error || !data.user) return reply(401, { error: 'unauthorized' });
    }

    let raw: unknown = {};
    const text = await req.text();
    if (text.trim() !== '') {
      try {
        raw = JSON.parse(text);
      } catch {
        return reply(400, { error: 'invalid_request' });
      }
    }
    const parsed = materializeRequestSchema.safeParse(raw);
    if (!parsed.success) return reply(400, { error: 'invalid_request' });
    const { taskIds, until } = parsed.data;
    // The sweep of every task belongs to the cron job.
    if (reader !== admin && !taskIds && !until) return reply(400, { error: 'empty_request' });

    const now = Date.now();
    const limitMs = until
      ? Math.min(Date.parse(until), now + taskDefaults.onDemandMaxDays * DAY_MS)
      : now + taskDefaults.materializationWindowDays * DAY_MS;

    const totals = await materialize(reader, admin, taskIds, limitMs);
    // Counts only: no title, note or user id in a log.
    console.log(
      JSON.stringify({
        event: 'materialized',
        caller: reader === admin ? 'cron' : 'user',
        ...totals,
      }),
    );
    return reply(200, materializeResponseSchema.parse({ inserted: totals.inserted }));
  } catch (error) {
    if (!(error instanceof DatabaseError)) console.error(JSON.stringify({ event: 'unexpected' }));
    return reply(500, { error: 'internal' });
  }
});
