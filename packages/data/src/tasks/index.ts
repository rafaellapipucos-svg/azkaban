import {
  materializeResponseSchema,
  taskBatchInputSchema,
  taskErrorCodeSchema,
  taskInputSchema,
  taskSchema,
  type Occurrence,
  type OccurrenceListItem,
  type OccurrenceTransitionInput,
  type StatusHistoryEntry,
  type Task,
  type TaskBatchInput,
  type TaskDeleteInput,
  type TaskEditInput,
  type TaskErrorCode,
  type TaskInput,
  type TeamOverviewRow,
} from '@azkaban/contracts';
import type { Json } from '../database.types';
import { db } from '../client';

/** `code` is null for anything the correct app cannot cause: the UI shows its generic text. */
export class TaskError extends Error {
  constructor(
    readonly code: TaskErrorCode | null,
    options?: { cause?: unknown },
  ) {
    super(code ?? 'task_error', options);
    this.name = 'TaskError';
  }
}

/** The RPCs raise their code as the message (ADR-0005), so a code outside the schema is a defect. */
export function taskErrorCode(error: unknown): TaskErrorCode | null {
  if (error instanceof TaskError) return error.code;
  const message =
    typeof error === 'object' && error !== null && 'message' in error ? error.message : null;
  const parsed = taskErrorCodeSchema.safeParse(message);
  return parsed.success ? parsed.data : null;
}

const toTaskError = (error: unknown) => new TaskError(taskErrorCode(error), { cause: error });

// A calendar read goes page by page, up to this many pages (50 000 rows would be a defect).
const calendarPageSize = 500;
const calendarMaxPages = 100;

// Joins the task and its context's area, which is all the lists need. `created_at` is selected only
// so the lists can order by it. `!inner` drops rows the filters on the joined tables remove.
const listColumns =
  'id, task_id, assignee_id, scheduled_start, scheduled_due, overdue_at, status, late, status_reason, status_changed_at, status_changed_by, proof_review_status, tasks!inner(created_at, title, context_id, group_id, created_by, assignee_id, schedule_type, timezone, priority, difficulty, visibility, rrule, requires_partial_reason, requires_photo_proof, requires_admin_approval, archived_at, contexts!inner(area_id))';

type OccurrenceRow = {
  id: string;
  task_id: string;
  assignee_id: string;
  scheduled_start: string;
  scheduled_due: string;
  overdue_at: string;
  status: Occurrence['status'];
  late: boolean;
  status_reason: string | null;
  status_changed_at: string | null;
  status_changed_by: string | null;
  proof_review_status: Occurrence['proofReviewStatus'];
};

const toOccurrence = (row: OccurrenceRow): Occurrence => ({
  id: row.id,
  taskId: row.task_id,
  assigneeId: row.assignee_id,
  scheduledStart: row.scheduled_start,
  scheduledDue: row.scheduled_due,
  overdueAt: row.overdue_at,
  status: row.status,
  late: row.late,
  statusReason: row.status_reason,
  statusChangedAt: row.status_changed_at,
  statusChangedBy: row.status_changed_by,
  proofReviewStatus: row.proof_review_status,
});

type ListRow = OccurrenceRow & {
  tasks: {
    title: string;
    context_id: string;
    group_id: string | null;
    created_by: string | null;
    assignee_id: string;
    schedule_type: OccurrenceListItem['task']['scheduleType'];
    timezone: string;
    priority: OccurrenceListItem['task']['priority'];
    difficulty: OccurrenceListItem['task']['difficulty'];
    visibility: OccurrenceListItem['task']['visibility'];
    rrule: string | null;
    requires_partial_reason: boolean;
    requires_photo_proof: boolean;
    requires_admin_approval: boolean;
    contexts: { area_id: string };
  };
};

const toListItem = (row: ListRow): OccurrenceListItem => ({
  ...toOccurrence(row),
  areaId: row.tasks.contexts.area_id,
  task: {
    title: row.tasks.title,
    contextId: row.tasks.context_id,
    groupId: row.tasks.group_id,
    createdBy: row.tasks.created_by,
    assigneeId: row.tasks.assignee_id,
    scheduleType: row.tasks.schedule_type,
    timezone: row.tasks.timezone,
    priority: row.tasks.priority,
    difficulty: row.tasks.difficulty,
    visibility: row.tasks.visibility,
    rrule: row.tasks.rrule,
    requiresPartialReason: row.tasks.requires_partial_reason,
    requiresPhotoProof: row.tasks.requires_photo_proof,
    requiresAdminApproval: row.tasks.requires_admin_approval,
  },
});

/** The form without its recurrence, which is stored as `rrule`. */
const taskFields = (input: TaskInput) => ({
  title: input.title,
  notes: input.notes,
  contextId: input.contextId,
  assigneeId: input.assigneeId,
  scheduleType: input.scheduleType,
  startAt: input.startAt,
  dueAt: input.dueAt,
  durationMin: input.durationMin,
  timezone: input.timezone,
  reminders: input.reminders,
  requiresPhotoProof: input.requiresPhotoProof,
  requiresAdminApproval: input.requiresAdminApproval,
  requiresPartialReason: input.requiresPartialReason,
  difficulty: input.difficulty,
  priority: input.priority,
  visibility: input.visibility,
});

const toInsertRow = (input: TaskInput, rrule: string | null) => ({
  context_id: input.contextId,
  assignee_id: input.assigneeId,
  title: input.title,
  notes: input.notes,
  schedule_type: input.scheduleType,
  start_at: input.startAt,
  due_at: input.dueAt,
  duration_min: input.durationMin,
  timezone: input.timezone,
  rrule,
  reminders: input.reminders,
  requires_photo_proof: input.requiresPhotoProof,
  requires_admin_approval: input.requiresAdminApproval,
  requires_partial_reason: input.requiresPartialReason,
  difficulty: input.difficulty,
  priority: input.priority,
  visibility: input.visibility,
});

// The generated types make the nullable RPC arguments `string`, but SQL accepts null and the
// ADR gives it a meaning (p_rrule null: stop repeating).
const sqlNull = (value: string | null) => value as string;

export const tasksRepository = {
  /** Occurrences that overlap `[from, to)`, cancelled and archived ones left out. */
  async listOccurrences({
    from,
    to,
    assigneeId,
  }: {
    from: string;
    to: string;
    assigneeId?: string;
  }): Promise<OccurrenceListItem[]> {
    let query = db()
      .from('task_occurrences')
      .select(listColumns)
      .is('tasks.archived_at', null)
      .neq('status', 'cancelled')
      .lt('scheduled_start', to)
      .gte('scheduled_due', from);
    if (assigneeId) query = query.eq('assignee_id', assigneeId);
    // Ties on the start keep one order, however the status changes: the order the tasks were
    // created in, then the id. Postgres returns ties in physical order, which an update moves, and
    // the row a finger just touched jumped to another place in the list.
    const { data, error } = await query
      .order('scheduled_start')
      .order('tasks(created_at)')
      .order('id')
      .limit(500);
    if (error) throw toTaskError(error);
    return data.map(toListItem);
  },

  /**
   * What a calendar view draws: every occurrence that overlaps `[from, to)`, cancelled and
   * archived ones left out, read page by page because a month of a whole team passes the limit
   * of one request. The database decides what is visible (RLS).
   * - `assigneeId`: one person's occurrences.
   * - `groupId`: only that group's tasks. Together with `groupOnly`, only those shared with the
   *   group (`visibility = 'group'`), which is what the team view counts, so an admin's own
   *   private task in a group context never shows as part of "the team".
   */
  async listCalendar({
    from,
    to,
    assigneeId,
    groupId,
    groupOnly,
  }: {
    from: string;
    to: string;
    assigneeId?: string;
    groupId?: string;
    groupOnly?: boolean;
  }): Promise<OccurrenceListItem[]> {
    const items: OccurrenceListItem[] = [];
    for (let page = 0; page < calendarMaxPages; page += 1) {
      let query = db()
        .from('task_occurrences')
        .select(listColumns)
        .is('tasks.archived_at', null)
        .neq('status', 'cancelled')
        .lt('scheduled_start', to)
        .gte('scheduled_due', from);
      if (assigneeId) query = query.eq('assignee_id', assigneeId);
      if (groupId) query = query.eq('tasks.group_id', groupId);
      if (groupOnly) query = query.eq('tasks.visibility', 'group');
      const { data, error } = await query
        .order('scheduled_start')
        .order('tasks(created_at)')
        .order('id')
        .range(page * calendarPageSize, (page + 1) * calendarPageSize - 1);
      if (error) throw toTaskError(error);
      items.push(...data.map(toListItem));
      if (data.length < calendarPageSize) break;
    }
    return items;
  },

  /**
   * Asks the Edge Function to create the repeating tasks' occurrences up to `until` (the end of
   * the visible range). Returns how many it created. The caller caps `until` at `onDemandMaxDays`.
   */
  async materializeUntil(until: string): Promise<number> {
    const { data, error } = await db().functions.invoke('materialize-occurrences', {
      body: { until },
    });
    if (error) throw new TaskError(null, { cause: error });
    return materializeResponseSchema.parse(data).inserted;
  },

  /**
   * Asks the Edge Function to create the occurrences of these repeating tasks. Throws when it fails,
   * so the screen can say so and offer a retry: until the daily job runs, the tasks have no
   * occurrence to show. Safe to repeat.
   */
  async materializeTasks(taskIds: string[]): Promise<void> {
    if (taskIds.length === 0) return;
    const { error } = await db().functions.invoke('materialize-occurrences', {
      body: { taskIds },
    });
    if (error) throw new TaskError(null, { cause: error });
  },

  /**
   * Per member and local day in the viewer's zone, for a group the user can view (`task.view_group`).
   * `timezone` is the profile's, not the device's (ADR-0006 section 1).
   */
  async teamOverview({
    groupId,
    from,
    to,
    timezone,
  }: {
    groupId: string;
    from: string;
    to: string;
    timezone: string;
  }): Promise<TeamOverviewRow[]> {
    const { data, error } = await db().rpc('team_overview', {
      p_group_id: groupId,
      p_from: from,
      p_to: to,
      p_timezone: timezone,
    });
    if (error) throw toTaskError(error);
    return data.map((row) => ({
      userId: row.user_id,
      displayName: row.display_name,
      date: row.date,
      pending: row.pending,
      done: row.done,
      partial: row.partial,
      missed: row.missed,
      late: row.late,
    }));
  },

  /** Pending ones past `overdueAt`: the job that marks them red does not exist yet. */
  async listOverdue({
    before,
    assigneeId,
  }: {
    before: string;
    assigneeId?: string;
  }): Promise<OccurrenceListItem[]> {
    let query = db()
      .from('task_occurrences')
      .select(listColumns)
      .is('tasks.archived_at', null)
      .eq('status', 'pending')
      .lt('overdue_at', before);
    if (assigneeId) query = query.eq('assignee_id', assigneeId);
    const { data, error } = await query
      .order('scheduled_start', { ascending: false })
      .order('tasks(created_at)')
      .order('id')
      .limit(100);
    if (error) throw toTaskError(error);
    return data.map(toListItem);
  },

  async getOccurrence(
    occurrenceId: string,
  ): Promise<{ item: OccurrenceListItem; task: Task } | null> {
    const { data, error } = await db()
      .from('task_occurrences')
      .select('*, tasks!inner(*, contexts!inner(area_id))')
      .eq('id', occurrenceId)
      .maybeSingle();
    if (error) throw toTaskError(error);
    if (!data) return null;
    const { contexts, ...row } = data.tasks;
    const task = taskSchema.parse({
      id: row.id,
      groupId: row.group_id,
      createdBy: row.created_by,
      title: row.title,
      notes: row.notes,
      contextId: row.context_id,
      assigneeId: row.assignee_id,
      scheduleType: row.schedule_type,
      startAt: row.start_at,
      dueAt: row.due_at,
      durationMin: row.duration_min,
      timezone: row.timezone,
      rrule: row.rrule,
      exdates: row.exdates,
      parentTaskId: row.parent_task_id,
      reminders: row.reminders,
      requiresPhotoProof: row.requires_photo_proof,
      requiresAdminApproval: row.requires_admin_approval,
      requiresPartialReason: row.requires_partial_reason,
      difficulty: row.difficulty,
      priority: row.priority,
      visibility: row.visibility,
      archivedAt: row.archived_at,
      createdAt: row.created_at,
    });
    return {
      item: toListItem({ ...data, tasks: { ...row, contexts } }),
      task,
    };
  },

  async listHistory(occurrenceId: string): Promise<StatusHistoryEntry[]> {
    const { data, error } = await db()
      .from('task_status_history')
      .select(
        'id, occurrence_id, from_status, to_status, changed_by, changed_at, reason, proof_review_status',
      )
      .eq('occurrence_id', occurrenceId)
      .order('changed_at', { ascending: false });
    if (error) throw toTaskError(error);
    return data.map((row) => ({
      id: row.id,
      occurrenceId: row.occurrence_id,
      fromStatus: row.from_status,
      toStatus: row.to_status,
      changedBy: row.changed_by,
      changedAt: row.changed_at,
      reason: row.reason,
      proofReviewStatus: row.proof_review_status,
    }));
  },

  /**
   * Returns the new task's id. A repeating task gets its occurrences from the Edge Function, which
   * the caller starts with `materializeTasks`: saving does not wait for it, because a cold start
   * takes several seconds.
   */
  async create(input: TaskInput, rrule: string | null): Promise<string> {
    const { data, error } = await db()
      .from('tasks')
      .insert(toInsertRow(taskInputSchema.parse(input), rrule))
      .select('id')
      .single();
    if (error) throw toTaskError(error);
    return data.id;
  },

  /** One task per assignee, in a single insert, so all of them exist or none does. */
  async createBatch(input: TaskBatchInput, rrule: string | null): Promise<string[]> {
    const { assigneeIds, ...rest } = taskBatchInputSchema.parse(input);
    const rows = assigneeIds.map((assigneeId) => toInsertRow({ ...rest, assigneeId }, rrule));
    const { data, error } = await db().from('tasks').insert(rows).select('id');
    if (error) throw toTaskError(error);
    return data.map(({ id }) => id);
  },

  async setStatus({
    occurrenceId,
    toStatus,
    expectedStatus,
    reason,
  }: OccurrenceTransitionInput): Promise<Occurrence> {
    const { data, error } = await db().rpc('set_occurrence_status', {
      p_occurrence_id: occurrenceId,
      p_to_status: toStatus,
      p_expected_status: expectedStatus,
      p_reason: sqlNull(reason),
    });
    if (error) throw toTaskError(error);
    return toOccurrence(data);
  },

  /**
   * `rrule` and `headRrule` come from `planEdit` in core. Returns the ids of the tasks the RPC
   * created or changed, which a repeating edit passes to `materializeTasks`.
   */
  async edit(
    { occurrenceId, scope, task }: TaskEditInput,
    { rrule, headRrule }: { rrule: string | null; headRrule: string | null },
  ): Promise<string[]> {
    const { data, error } = await db().rpc('edit_task', {
      p_occurrence_id: occurrenceId,
      p_scope: scope,
      p_task: taskFields(taskInputSchema.parse(task)) as Json,
      p_rrule: sqlNull(rrule),
      p_head_rrule: sqlNull(headRrule),
    });
    if (error) throw toTaskError(error);
    return data;
  },

  /** `headRrule` from `planDelete`. `all` archives the series and cannot be undone in Phase 2. */
  async remove({ occurrenceId, scope }: TaskDeleteInput, headRrule: string | null) {
    const { error } = await db().rpc('delete_task', {
      p_occurrence_id: occurrenceId,
      p_scope: scope,
      p_head_rrule: sqlNull(headRrule),
    });
    if (error) throw toTaskError(error);
  },
};
