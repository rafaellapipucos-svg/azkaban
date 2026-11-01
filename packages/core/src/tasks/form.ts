import { localDateSchema, taskBatchInputSchema } from '@azkaban/contracts';
import type {
  RecurrenceFrequency,
  RecurrenceInput,
  ScheduleType,
  Task,
  TaskBatchInput,
  TaskDifficulty,
  TaskEditScope,
  TaskInput,
  TaskPriority,
  TaskVisibility,
  Weekday,
} from '@azkaban/contracts';
import { alignToRule } from '../recurrence/align';
import { fromRRule } from '../recurrence/rrule';
import { dateOfWall, instantOf, localDateOf, wallClockOf, wallMidnight } from '../recurrence/zone';

/**
 * What the task form edits: text, a day and a time on the clock of the task's zone, never
 * instants. `buildTaskInput` turns it into the contract and `taskFormValues` goes back.
 */
export type TaskFormValues = {
  title: string;
  notes: string;
  contextId: string;
  assigneeIds: string[];
  scheduleType: ScheduleType;
  /** The day of a timed or all-day task; the due day of a deadline. `yyyy-MM-dd`. */
  date: string;
  /** `HH:mm`, for timed tasks. */
  time: string;
  /** Optional start day of a deadline, or `''`. */
  startDate: string;
  hasDuration: boolean;
  durationMin: number;
  reminders: number[];
  repeat: boolean;
  recurrence: RecurrenceInput;
  requiresPhotoProof: boolean;
  requiresAdminApproval: boolean;
  requiresPartialReason: boolean;
  difficulty: TaskDifficulty;
  priority: TaskPriority;
  visibility: TaskVisibility;
};

const WEEKDAYS: readonly Weekday[] = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'];

/** A deadline given as a day only falls due at the end of it. */
export const DEADLINE_TIME = '23:59';
const MIDNIGHT = '00:00';
const DEFAULT_DURATION_MIN = 30;

/** Monday-first weekday of a `yyyy-MM-dd` date. */
export function weekdayOf(date: string): Weekday {
  return WEEKDAYS[(new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7]!;
}

/** The instant at which `timezone` shows `date` and `time`. */
export function zonedInstant(timezone: string, date: string, time: string): string {
  return new Date(instantOf(timezone, Date.parse(`${date}T${time}:00Z`))).toISOString();
}

/** `HH:mm` on the clock of `timezone`. */
export function localTimeOf(timezone: string, instant: string): string {
  return new Date(wallClockOf(timezone, Date.parse(instant))).toISOString().slice(11, 16);
}

/** The next full hour, for a task made quickly: close to now but not already late. */
export function nextHourTime(timezone: string, at: Date): string {
  const hour = Number(localTimeOf(timezone, at.toISOString()).slice(0, 2)) + 1;
  return hour > 23 ? DEADLINE_TIME : `${String(hour).padStart(2, '0')}:00`;
}

const PREFILL_TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * The day and time a route asked the new-task form to start with. `day` is `tomorrow` or a real
 * `yyyy-MM-dd` date (from a tap in the calendar); `time` is `HH:mm`. Anything else, such as a
 * hand-edited link, falls back: today, and no time, so the caller picks its own.
 */
export function resolvePrefill(
  prefill: { day?: string; time?: string },
  today: string,
): { date: string; time: string | null } {
  const date =
    prefill.day === 'tomorrow'
      ? addDays(today, 1)
      : localDateSchema.safeParse(prefill.day).success
        ? (prefill.day as string)
        : today;
  const time = prefill.time !== undefined && PREFILL_TIME.test(prefill.time) ? prefill.time : null;
  return { date, time };
}

/** Adds `days` to a `yyyy-MM-dd` date. */
export function addDays(date: string, days: number): string {
  return dateOfWall(wallMidnight(date) + days * 86_400_000);
}

export function defaultRecurrence(): RecurrenceInput {
  return { frequency: 'daily', interval: 1, weekdays: [], monthDay: null, end: { type: 'never' } };
}

/** Switching the kind of repetition keeps the rest valid: a weekly rule needs days, a monthly one a day. */
export function withFrequency(
  recurrence: RecurrenceInput,
  frequency: RecurrenceFrequency,
  date: string,
): RecurrenceInput {
  const monthDay = Number(date.slice(8, 10));
  return {
    ...recurrence,
    frequency,
    weekdays: frequency === 'weekly' ? [weekdayOf(date)] : [],
    monthDay: frequency === 'monthly' ? monthDay : null,
  };
}

type BuildContext = {
  timezone: string;
  assigneeId: string;
  /** Who made the task: only they can keep it private, and only for themselves. */
  creatorId: string;
  /** A personal context has no group to share with. */
  personalContext: boolean;
};

/**
 * ADR-0005 and the architect's handoff: `all_day` keeps local midnight of its day, a deadline
 * given as a day falls due at 23:59, and a repeating task starts on the first date of its rule.
 * @throws RangeError from `alignToRule`, when the rule ends before the task starts or never happens
 */
export function buildTaskInput(
  values: TaskFormValues,
  { timezone, assigneeId, creatorId, personalContext }: BuildContext,
): TaskInput {
  const { scheduleType, date } = values;
  const schedule: Pick<TaskInput, 'startAt' | 'dueAt' | 'durationMin'> =
    scheduleType === 'timed'
      ? {
          startAt: zonedInstant(timezone, date, values.time),
          dueAt: null,
          durationMin: values.hasDuration ? values.durationMin : null,
        }
      : scheduleType === 'all_day'
        ? { startAt: zonedInstant(timezone, date, MIDNIGHT), dueAt: null, durationMin: null }
        : {
            startAt: values.startDate ? zonedInstant(timezone, values.startDate, MIDNIGHT) : null,
            dueAt: zonedInstant(timezone, date, DEADLINE_TIME),
            durationMin: null,
          };

  const recurrence = values.repeat ? values.recurrence : null;
  const aligned = recurrence
    ? alignToRule({ scheduleType, timezone, ...schedule }, recurrence)
    : {};
  const keepPrivate =
    personalContext || (values.visibility === 'private' && assigneeId === creatorId);
  // Approval needs a photo to look at and a group to see it (the contract and the database refuse
  // the rest), so a switch left on by an earlier choice cannot make the form fail.
  const requiresAdminApproval =
    values.requiresAdminApproval && values.requiresPhotoProof && !keepPrivate;

  return {
    title: values.title.trim(),
    notes: values.notes.trim() || null,
    contextId: values.contextId,
    assigneeId,
    scheduleType,
    ...schedule,
    ...aligned,
    timezone,
    reminders:
      scheduleType === 'all_day' ? [] : [...new Set(values.reminders)].sort((a, b) => b - a),
    requiresPhotoProof: values.requiresPhotoProof,
    requiresAdminApproval,
    requiresPartialReason: values.requiresPartialReason,
    difficulty: values.difficulty,
    priority: values.priority,
    visibility: keepPrivate ? 'private' : 'group',
    recurrence,
  };
}

/**
 * Whether the form offers the approval switch (ADR-0007 section 10): only with a photo, in a task
 * shared with a group, and only when nobody who would send the photo is the person editing, because
 * nobody approves their own photo and a group with one administrator would wait for ever.
 */
export function offersAdminApproval(
  values: Pick<TaskFormValues, 'requiresPhotoProof' | 'visibility' | 'assigneeIds'>,
  { personalContext, editorId }: { personalContext: boolean; editorId: string },
): boolean {
  return (
    values.requiresPhotoProof &&
    !personalContext &&
    values.visibility === 'group' &&
    values.assigneeIds.every((id) => id !== editorId)
  );
}

/** One task per assignee, always visible to the group (the contract forbids a private batch). */
export function toBatchInput(input: TaskInput, assigneeIds: string[]): TaskBatchInput {
  // The schema drops `assigneeId` and checks the result.
  return taskBatchInputSchema.parse({ ...input, assigneeIds, visibility: 'group' });
}

/** The recurrence a task repeats by, or null when it does not repeat or the rule is not the app's. */
function recurrenceOf(task: Pick<Task, 'rrule' | 'timezone'>): RecurrenceInput | null {
  if (task.rrule === null) return null;
  try {
    return fromRRule(task.rrule, task.timezone);
  } catch {
    return null;
  }
}

export type FormTask = Pick<
  Task,
  | 'title'
  | 'notes'
  | 'contextId'
  | 'assigneeId'
  | 'scheduleType'
  | 'startAt'
  | 'dueAt'
  | 'durationMin'
  | 'timezone'
  | 'reminders'
  | 'requiresPhotoProof'
  | 'requiresAdminApproval'
  | 'requiresPartialReason'
  | 'difficulty'
  | 'priority'
  | 'visibility'
  | 'rrule'
>;

/** The occurrence fields the form shows when the scope is not the whole series. */
type OccurrenceTimes = { scheduledStart: string; scheduledDue: string };

/**
 * Form values of an existing task. For `all` the form shows the series anchor; for `this` and
 * `this_and_following` it shows the occurrence being edited, because that is the day the new
 * task starts on (ADR-0005 section 8). A `this` edit never repeats.
 */
export function taskFormValues(
  task: FormTask,
  occurrence: OccurrenceTimes,
  scope: TaskEditScope,
): TaskFormValues {
  const { timezone } = task;
  const useTask = scope === 'all';
  const start = useTask
    ? (task.startAt ?? task.dueAt ?? occurrence.scheduledStart)
    : occurrence.scheduledStart;
  const due = useTask ? (task.dueAt ?? start) : occurrence.scheduledDue;
  const deadline = task.scheduleType === 'deadline';
  const anchorDay = localDateOf(timezone, Date.parse(deadline ? due : start));
  const recurrence = scope === 'this' ? null : recurrenceOf(task);

  return {
    title: task.title,
    notes: task.notes ?? '',
    contextId: task.contextId,
    assigneeIds: [task.assigneeId],
    scheduleType: task.scheduleType,
    date: anchorDay,
    time: localTimeOf(timezone, start),
    startDate: deadline && task.startAt !== null ? localDateOf(timezone, Date.parse(start)) : '',
    hasDuration: task.durationMin !== null,
    durationMin: task.durationMin ?? DEFAULT_DURATION_MIN,
    reminders: task.reminders,
    repeat: recurrence !== null,
    recurrence: recurrence ?? defaultRecurrence(),
    requiresPhotoProof: task.requiresPhotoProof,
    requiresAdminApproval: task.requiresAdminApproval,
    requiresPartialReason: task.requiresPartialReason,
    difficulty: task.difficulty,
    priority: task.priority,
    visibility: task.visibility,
  };
}
