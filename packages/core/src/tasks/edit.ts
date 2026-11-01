import type { RecurrenceInput, Task, TaskEditScope, TaskInput } from '@azkaban/contracts';
import { taskAnchor } from '../recurrence/expand';
import { toRRule } from '../recurrence/rrule';
import { splitRecurrence } from '../recurrence/split';
import { defaultRecurrence } from './form';

type SeriesTask = Pick<Task, 'rrule' | 'startAt' | 'dueAt' | 'timezone'>;

/** What `edit_task` and `delete_task` receive besides the form (ADR-0005 section 8). */
export type RulePlan = { rrule: string | null; headRrule: string | null };

const STOP: RecurrenceInput = defaultRecurrence();

/** The rule of a new task, or null when it does not repeat. */
export function rruleOf(
  input: Pick<TaskInput, 'recurrence' | 'startAt' | 'dueAt' | 'timezone'>,
): string | null {
  return input.recurrence ? toRRule(input.recurrence, taskAnchor(input), input.timezone) : null;
}

/**
 * The rule strings for an edit, computed here because only core reads RRULE. The RPC compares
 * `rrule` as text to know whether the schedule changed, and `toRRule` is stable for that.
 * - `this`: the occurrence becomes a one-off task, so there is no rule.
 * - `all`: the rule of the form, or none when the task stops repeating.
 * - `this_and_following`: the tail starts at the pivot and the original ends before it.
 * @throws RangeError `count_before_pivot`, `recurrence_ends_before_anchor`
 */
export function planEdit({
  scope,
  task,
  pivotStart,
  input,
}: {
  scope: TaskEditScope;
  task: SeriesTask;
  pivotStart: string;
  input: Pick<TaskInput, 'recurrence' | 'startAt' | 'dueAt' | 'timezone'>;
}): RulePlan {
  if (scope === 'this') return { rrule: null, headRrule: null };
  const { recurrence } = input;
  const whole = rruleOf(input);
  if (scope === 'all' || task.rrule === null) return { rrule: whole, headRrule: null };

  const { headRrule, tailRrule } = splitRecurrence(task, pivotStart, recurrence ?? STOP);
  return { rrule: recurrence ? tailRrule : null, headRrule };
}

/** The rule the original series keeps when `this_and_following` is deleted from the pivot on. */
export function planDelete({
  scope,
  task,
  pivotStart,
}: {
  scope: TaskEditScope;
  task: SeriesTask;
  pivotStart: string;
}): string | null {
  if (scope !== 'this_and_following' || task.rrule === null) return null;
  return splitRecurrence(task, pivotStart, STOP).headRrule;
}
