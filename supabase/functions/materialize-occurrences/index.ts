// Creates the occurrences of recurring tasks (ADR-0005, section 7). Two callers:
//   - the daily cron job: header `x-cron-secret`, empty body, every recurring task;
//   - a signed-in user: JWT and `taskIds` and/or `until`, only the tasks their own RLS lets them read.
// The expansion is `expandOccurrences` from packages/core, imported through deno.json. That file
// maps the packages to the entry points this function needs, because Deno resolves neither
// extensionless relative imports nor named exports of rrule's CommonJS bundle (see rrule-shim.ts).
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { timingSafeEqual } from 'node:crypto';
import { taskDefaults } from '@azkaban/config';
import { proofDefaults } from '../../../packages/config/src/proof.ts';
import { materializeRequestSchema, materializeResponseSchema } from '@azkaban/contracts';
import { expandOccurrences, taskAnchor } from '@azkaban/core';
import { readLimited } from '../_shared/body.ts';

const DAY_MS = 86_400_000;
// Group membership is checked with one filter per task, so a page keeps that URL short.
const PAGE_SIZE = 50;
const INSERT_CHUNK = 500;

// 100 ids and an instant fit in about 4 KiB (ADR-0008, section 12). The read stops at this, so any
// signed-in user cannot make the function hold a body of any size.
const MAX_BODY_BYTES = 8 * 1024;

// Budget of one run, so it ends before the platform's 2 s CPU limit per request (Supabase docs,
// Edge Functions limits) and leaves the rest for the next run. Expansion is the CPU part: about
// 0.3 ms per typical task, but up to 30 ms for a daily series anchored in 2000, because rrule iterates
// from the anchor. The task count bounds the database round trips (two per task).
const EXPAND_BUDGET_MS = 600;
const MAX_TASKS = 200;
// A run looks at the stalest tasks only. Tasks that are skipped for good (former member, rule that
// does not expand) stay among them and do not count against MAX_TASKS, so this bounds how many of
// them can crowd out the others before something needs fixing.
// ponytail: above SCAN permanently skipped tasks, healthy ones starve; fix by clearing those tasks.
const SCAN = 1000;
// A sweep without `until` skips a task whose cursor is less than this behind the limit: the daily
// job is 24 h apart, so a task refreshed this morning is not worth a second look in the evening.
const REFRESH_SLACK_MS = 12 * 3_600_000;

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
// `data` is null only together with an error, which throws; the client types do not tie the two.
function check<T>(stage: string, result: { data: T | null; error: { code?: string } | null }): T {
  if (result.error) {
    // The code and the stage only: messages can quote rows.
    console.error(JSON.stringify({ event: 'materialize_failed', stage, code: result.error.code }));
    throw new DatabaseError(stage);
  }
  return result.data as T;
}

/** The recurring tasks that still need work, stalest cursor first (never materialized first). */
async function staleTaskIds(reader: SupabaseClient, staleBefore: string): Promise<string[]> {
  const rows = check(
    'list_tasks',
    await reader
      .from('tasks')
      .select('id')
      .not('rrule', 'is', null)
      .is('archived_at', null)
      .or(`materialized_until.is.null,materialized_until.lt.${staleBefore}`)
      .order('materialized_until', { ascending: true, nullsFirst: true })
      .order('id')
      .limit(SCAN),
  );
  return rows.map((row) => row.id as string);
}

/** The rows of these tasks, in the order of `ids`. The reader decides which of them exist for the caller. */
async function readTasks(reader: SupabaseClient, ids: string[]): Promise<TaskRow[]> {
  const rows = check(
    'read_tasks',
    await reader
      .from('tasks')
      .select(TASK_COLUMNS)
      .in('id', ids)
      .not('rrule', 'is', null)
      .is('archived_at', null),
  ) as unknown as TaskRow[];
  const byId = new Map(rows.map((row) => [row.id, row]));
  return ids.flatMap((id) => byId.get(id) ?? []);
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

/** Moves the cursor of one task forward only. True when the database refuses the update. */
async function moveCursor(admin: SupabaseClient, id: string, limit: string): Promise<boolean> {
  const { error } = await admin
    .from('tasks')
    .update({ materialized_until: limit })
    .eq('id', id)
    .or(`materialized_until.is.null,materialized_until.lt.${limit}`);
  return Boolean(error && refused('move_cursor', error));
}

async function materialize(
  reader: SupabaseClient,
  admin: SupabaseClient,
  taskIds: string[] | undefined,
  limitMs: number,
  nowMs: number,
  slackMs: number,
) {
  const limit = new Date(limitMs).toISOString();
  // A daily series anchored in year 2000 would otherwise be 10 thousand rows and 300 ms of CPU.
  const floorMs = nowMs - taskDefaults.materializationPastDays * DAY_MS;
  const totals = { tasks: 0, formerMembers: 0, failed: 0, inserted: 0, deferred: 0, expandMs: 0 };
  let done = 0;

  const ids = taskIds ?? (await staleTaskIds(reader, new Date(limitMs - slackMs).toISOString()));
  for (let i = 0; i < ids.length; i += PAGE_SIZE) {
    const page = await readTasks(reader, ids.slice(i, i + PAGE_SIZE));
    const members = await currentMembers(admin, page);

    for (const [at, t] of page.entries()) {
      if (done >= MAX_TASKS || totals.expandMs >= EXPAND_BUDGET_MS) {
        // The rest keeps its cursors, which are the oldest, so the next run starts with it.
        totals.deferred = ids.length - i - at;
        return totals;
      }
      totals.tasks += 1;
      // Left the group: nothing is created, and the cursor stays, so a new assignee gets the
      // series from where it stopped instead of from today.
      if (t.group_id && !members.has(`${t.group_id}:${t.assignee_id}`)) {
        totals.formerMembers += 1;
        continue;
      }

      const began = performance.now();
      let rows: OccurrenceRow[];
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
        // Not before the floor, and not before what is already materialized. A series that starts
        // after the limit has no rows, and its cursor still moves, so it leaves the stale list.
        const from = Math.max(Date.parse(t.materialized_until ?? taskAnchor(task)), floorMs);
        rows =
          from >= limitMs
            ? []
            : expandOccurrences(task, new Date(from).toISOString(), limit).map((o) => ({
                task_id: t.id,
                assignee_id: t.assignee_id,
                scheduled_start: o.scheduledStart,
                scheduled_due: o.scheduledDue,
              }));
      } catch {
        // A rule that cannot be expanded must not stop the sweep. Counted, never quoted.
        totals.failed += 1;
        continue;
      } finally {
        totals.expandMs += performance.now() - began;
      }

      // One task at a time, the rows and then its cursor, so what is finished survives a worker
      // that dies, and a task the database refuses costs the others nothing. Only after the insert,
      // and only forward, so a failure in the middle is repeated safely.
      const result = await insertTask(admin, rows);
      totals.inserted += result.inserted;
      if (!result.ok || (await moveCursor(admin, t.id, limit))) {
        totals.failed += 1;
        continue;
      }
      done += 1;
    }
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

    const read = await readLimited(
      req.body,
      MAX_BODY_BYTES,
      proofDefaults.uploadTimeoutSeconds * 1000,
    );
    if (read.kind !== 'ok') return reply(400, { error: 'invalid_request' });
    let raw: unknown = {};
    const text = new TextDecoder().decode(read.bytes);
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

    const totals = await materialize(
      reader,
      admin,
      taskIds,
      limitMs,
      now,
      until ? 0 : REFRESH_SLACK_MS,
    );
    // Counts only: no title, note or user id in a log.
    console.log(
      JSON.stringify({
        event: 'materialized',
        caller: reader === admin ? 'cron' : 'user',
        ...totals,
        expandMs: Math.round(totals.expandMs),
      }),
    );
    // 200 even with failed > 0: what was inserted stays (ADR-0008, section 12).
    const { inserted, failed, deferred } = totals;
    return reply(200, materializeResponseSchema.parse({ inserted, failed, deferred }));
  } catch (error) {
    if (!(error instanceof DatabaseError)) console.error(JSON.stringify({ event: 'unexpected' }));
    return reply(500, { error: 'internal' });
  }
});
