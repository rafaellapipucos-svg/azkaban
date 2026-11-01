import type { Task } from '@azkaban/contracts';
import { RRule } from 'rrule';
import { DAY_MS, instantOf, localDateOf, wallClockOf } from './zone';

/** The fields of a task that decide its occurrences. */
export type ExpandableTask = Pick<
  Task,
  'scheduleType' | 'startAt' | 'dueAt' | 'durationMin' | 'timezone' | 'rrule' | 'exdates'
>;

export type ExpandedOccurrence = { scheduledStart: string; scheduledDue: string };

/** `coalesce(start_at, due_at)`: where the series begins and which time of day it keeps. */
export function taskAnchor(task: Pick<Task, 'startAt' | 'dueAt'>): string {
  const anchor = task.startAt ?? task.dueAt;
  if (anchor === null) throw new RangeError('task_without_anchor');
  return anchor;
}

/**
 * Starts (epoch ms) of the rule's instances, ignoring `exdates`, in expansion order. `rrule` works
 * on floating times, so the series is expanded in the zone's wall clock and each result is mapped
 * back to an instant: 9am stays 9am when the offset changes. A null rule is the anchor alone.
 */
export function ruleStarts(
  rrule: string | null,
  anchorMs: number,
  timezone: string,
  fromMs: number,
  toMs: number,
): number[] {
  const inRange = (ms: number) => ms >= fromMs && ms < toMs;
  if (rrule === null) return inRange(anchorMs) ? [anchorMs] : [];

  const anchorWall = wallClockOf(timezone, anchorMs);
  const { until, ...options } = RRule.parseString(rrule);
  const rule = new RRule({
    ...options,
    dtstart: new Date(anchorWall),
    ...(until ? { until: new Date(wallClockOf(timezone, until.getTime())) } : {}),
  });
  // A day of slack on each side, because the offset can move the edges of the window.
  const found = rule.between(
    new Date(wallClockOf(timezone, fromMs) - DAY_MS),
    new Date(wallClockOf(timezone, toMs) + DAY_MS),
    true,
  );
  return found
    .map((date) => (date.getTime() === anchorWall ? anchorMs : instantOf(timezone, date.getTime())))
    .filter(inRange);
}

/**
 * Where a deadline's due moment lands: the same offset from the anchor, in local days and
 * time of day, so a deadline "two days after the start" keeps that shape across a DST change.
 */
function scheduledDue(task: ExpandableTask, startMs: number, anchorMs: number): number {
  const { timezone } = task;
  if (task.scheduleType === 'timed') {
    return startMs + (task.durationMin ?? 0) * 60_000;
  }
  const startWall = wallClockOf(timezone, startMs);
  if (task.scheduleType === 'all_day') {
    return instantOf(timezone, startWall - (startWall % DAY_MS) + DAY_MS);
  }
  const dueMs = task.dueAt === null ? anchorMs : Date.parse(task.dueAt);
  const shiftedDays = Math.round((startWall - wallClockOf(timezone, anchorMs)) / DAY_MS);
  return shiftedDays === 0
    ? dueMs
    : instantOf(timezone, wallClockOf(timezone, dueMs) + shiftedDays * DAY_MS);
}

/**
 * Occurrences of a task with `from <= scheduledStart < to`, in time order, without the instances
 * whose local day (in the task's zone) is in `exdates`: a day, not an instant, so an excluded day
 * stays out after a change of time or zone, and in the repeated or missing hour of a DST change.
 * A listed day the rule does not reach is inert. Half-open, so consecutive windows never repeat an occurrence. A task without
 * `rrule` yields its single occurrence. Pure: this is the function the Edge Function calls.
 */
export function expandOccurrences(
  task: ExpandableTask,
  from: string,
  to: string,
): ExpandedOccurrence[] {
  const anchorMs = Date.parse(taskAnchor(task));
  const excluded = new Set(task.exdates);
  return ruleStarts(task.rrule, anchorMs, task.timezone, Date.parse(from), Date.parse(to))
    .filter((start) => !excluded.has(localDateOf(task.timezone, start)))
    .map((start) => ({
      scheduledStart: new Date(start).toISOString(),
      scheduledDue: new Date(scheduledDue(task, start, anchorMs)).toISOString(),
    }));
}
