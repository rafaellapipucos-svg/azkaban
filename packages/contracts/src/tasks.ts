import { z } from 'zod';
import { idSchema, instantSchema, localDateSchema, timezoneSchema } from './common';
import { recurrenceInputSchema } from './recurrence';

export const occurrenceStatusSchema = z.enum(['pending', 'done', 'partial', 'missed', 'cancelled']);
export type OccurrenceStatus = z.infer<typeof occurrenceStatusSchema>;

export const scheduleTypeSchema = z.enum(['timed', 'all_day', 'deadline']);
export type ScheduleType = z.infer<typeof scheduleTypeSchema>;

export const taskVisibilitySchema = z.enum(['group', 'private']);
export type TaskVisibility = z.infer<typeof taskVisibilitySchema>;

export const taskDifficultySchema = z.enum(['easy', 'medium', 'hard']);
export type TaskDifficulty = z.infer<typeof taskDifficultySchema>;

export const taskPrioritySchema = z.enum(['low', 'normal', 'high']);
export type TaskPriority = z.infer<typeof taskPrioritySchema>;

export const taskEditScopeSchema = z.enum(['this', 'this_and_following', 'all']);
export type TaskEditScope = z.infer<typeof taskEditScopeSchema>;

// Derived per request from the task and the matrix, never stored. See ADR-0005.
export const occurrenceActorSchema = z.enum(['assignee', 'editor', 'deleter', 'system']);
export type OccurrenceActor = z.infer<typeof occurrenceActorSchema>;

// Instants in UTC. An all_day task keeps local midnight of its day, in `timezone`, in startAt.
const taskDefinition = {
  title: z.string().trim().min(1).max(120),
  notes: z.string().trim().max(2000).nullable(),
  contextId: idSchema,
  assigneeId: idSchema,
  scheduleType: scheduleTypeSchema,
  startAt: instantSchema.nullable(),
  dueAt: instantSchema.nullable(),
  durationMin: z.int().min(1).max(1440).nullable(),
  timezone: timezoneSchema,
  /** Minutes before the task, with 0 meaning at the time. */
  reminders: z.array(z.int().min(0).max(43200)).max(5),
  // Stored from Phase 2 and enforced from Phase 3.
  requiresPhotoProof: z.boolean(),
  requiresAdminApproval: z.boolean(),
  requiresPartialReason: z.boolean(),
  difficulty: taskDifficultySchema,
  priority: taskPrioritySchema,
  visibility: taskVisibilitySchema,
};

type Schedule = {
  scheduleType: ScheduleType;
  startAt: string | null;
  dueAt: string | null;
  durationMin: number | null;
};

function checkSchedule(
  { scheduleType, startAt, dueAt, durationMin }: Schedule,
  ctx: z.RefinementCtx,
) {
  const issue = (path: string, message: string) =>
    ctx.addIssue({ code: 'custom', path: [path], message });

  if (scheduleType === 'deadline') {
    if (dueAt === null) issue('dueAt', 'required');
    if (startAt && dueAt && Date.parse(startAt) >= Date.parse(dueAt)) {
      issue('startAt', 'after_due');
    }
  } else {
    if (startAt === null) issue('startAt', 'required');
    if (dueAt !== null) issue('dueAt', 'deadline_only');
  }
  if (scheduleType !== 'timed' && durationMin !== null) issue('durationMin', 'timed_only');
}

const taskInputObject = z.object({
  ...taskDefinition,
  recurrence: recurrenceInputSchema.nullable(),
});

/** No field has a default here: forms start from `taskDefaults` in @azkaban/config. */
export const taskInputSchema = taskInputObject.superRefine(checkSchedule);
export type TaskInput = z.infer<typeof taskInputSchema>;

/** One task per assignee, always visible to the group: a private task belongs to its creator. */
export const taskBatchInputSchema = taskInputObject
  .omit({ assigneeId: true })
  .extend({
    assigneeIds: z.array(idSchema).min(1).max(100),
    visibility: z.literal('group'),
  })
  .superRefine(checkSchedule);
export type TaskBatchInput = z.infer<typeof taskBatchInputSchema>;

export const taskSchema = z
  .object({
    ...taskDefinition,
    id: idSchema,
    groupId: idSchema.nullable(),
    createdBy: idSchema.nullable(),
    rrule: z.string().nullable(),
    exdates: z.array(instantSchema),
    /** The series this task was split or detached from. */
    parentTaskId: idSchema.nullable(),
    archivedAt: instantSchema.nullable(),
    createdAt: instantSchema,
  })
  .superRefine(checkSchedule);
export type Task = z.infer<typeof taskSchema>;

/** Sends the whole form: the scope decides what it replaces. See ADR-0005. */
export const taskEditInputSchema = z.object({
  occurrenceId: idSchema,
  scope: taskEditScopeSchema,
  task: taskInputSchema,
});
export type TaskEditInput = z.infer<typeof taskEditInputSchema>;

export const taskDeleteInputSchema = z.object({
  occurrenceId: idSchema,
  scope: taskEditScopeSchema,
});
export type TaskDeleteInput = z.infer<typeof taskDeleteInputSchema>;

export const occurrenceSchema = z.object({
  id: idSchema,
  taskId: idSchema,
  assigneeId: idSchema,
  scheduledStart: instantSchema,
  scheduledDue: instantSchema,
  /** When the occurrence stops being on time. Computed by the database. */
  overdueAt: instantSchema,
  status: occurrenceStatusSchema,
  late: z.boolean(),
  statusReason: z.string().nullable(),
  statusChangedAt: instantSchema.nullable(),
  statusChangedBy: idSchema.nullable(),
});
export type Occurrence = z.infer<typeof occurrenceSchema>;

/** Row of Hoje, tabs and calendar, which live in different features. */
export type OccurrenceListItem = Occurrence & {
  areaId: string;
  task: Pick<
    Task,
    | 'title'
    | 'contextId'
    | 'scheduleType'
    | 'timezone'
    | 'priority'
    | 'visibility'
    | 'rrule'
    | 'requiresPartialReason'
  >;
};

export const occurrenceTransitionInputSchema = z.object({
  occurrenceId: idSchema,
  toStatus: occurrenceStatusSchema,
  /** The status the user saw. A mismatch fails with `status_conflict`. */
  expectedStatus: occurrenceStatusSchema,
  reason: z.string().trim().min(1).max(500).nullable(),
});
export type OccurrenceTransitionInput = z.infer<typeof occurrenceTransitionInputSchema>;

export const statusHistoryEntrySchema = z.object({
  id: idSchema,
  occurrenceId: idSchema,
  fromStatus: occurrenceStatusSchema,
  toStatus: occurrenceStatusSchema,
  /** Null when a job made the change, or after the account was deleted. */
  changedBy: idSchema.nullable(),
  changedAt: instantSchema,
  reason: z.string().nullable(),
});
export type StatusHistoryEntry = z.infer<typeof statusHistoryEntrySchema>;

/** One row per member and local day. Members with nothing that day have no row. */
export const teamOverviewRowSchema = z.object({
  userId: idSchema,
  displayName: z.string(),
  date: localDateSchema,
  pending: z.int().min(0),
  done: z.int().min(0),
  partial: z.int().min(0),
  missed: z.int().min(0),
  late: z.int().min(0),
});
export type TeamOverviewRow = z.infer<typeof teamOverviewRowSchema>;

export const xpEventReasonSchema = z.enum([
  'occurrence_done',
  'occurrence_done_late',
  'occurrence_partial',
  'occurrence_reverted',
]);
export type XpEventReason = z.infer<typeof xpEventReasonSchema>;

export const xpEventSchema = z.object({
  id: idSchema,
  userId: idSchema,
  groupId: idSchema.nullable(),
  occurrenceId: idSchema.nullable(),
  amount: z.int(),
  reason: xpEventReasonSchema,
  createdAt: instantSchema,
});
export type XpEvent = z.infer<typeof xpEventSchema>;

/** Messages raised by the task RPCs, which the UI maps to i18n keys. */
export const taskErrorCodeSchema = z.enum([
  'forbidden',
  'invalid_transition',
  'status_conflict',
  'reason_required',
  'late_window_expired',
  'occurrence_not_pending',
]);
export type TaskErrorCode = z.infer<typeof taskErrorCodeSchema>;

/**
 * Body of the `materialize-occurrences` Edge Function. Empty from the cron job, for every
 * recurring task. From a user: `taskIds` after an edit, `until` when navigating past the window.
 */
export const materializeRequestSchema = z.object({
  taskIds: z.array(idSchema).min(1).max(100).optional(),
  until: instantSchema.optional(),
});
export type MaterializeRequest = z.infer<typeof materializeRequestSchema>;

export const materializeResponseSchema = z.object({ inserted: z.int().min(0) });
export type MaterializeResponse = z.infer<typeof materializeResponseSchema>;
