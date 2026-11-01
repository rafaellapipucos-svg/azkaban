import type { RecurrenceInput, ScheduleType, Task } from '@azkaban/contracts';
import { ruleStarts } from './expand';
import { toRRule } from './rrule';
import { DAY_MS, instantOf, wallClockOf } from './zone';

type Schedule = Pick<Task, 'startAt' | 'dueAt' | 'timezone'> & { scheduleType: ScheduleType };

const DAYS_PER_STEP = { daily: 1, weekly: 7, monthly: 31 } as const;

/**
 * ADR-0005 section 7: when the anchor is not on the rule, the first occurrence is the first date
 * of the rule and the anchor is dropped. The editor moves `startAt` there on save, so the date the
 * user saw is the real one. A deadline moves its due date by the same number of local days.
 * @throws RangeError `recurrence_ends_before_anchor` or `recurrence_has_no_occurrence`
 */
export function alignToRule(
  schedule: Schedule,
  recurrence: RecurrenceInput,
): Pick<Task, 'startAt' | 'dueAt'> {
  const { timezone, startAt, dueAt } = schedule;
  const anchor = startAt ?? dueAt;
  if (anchor === null) throw new RangeError('task_without_anchor');
  const rrule = toRRule(recurrence, anchor, timezone);
  const anchorMs = Date.parse(anchor);
  // A rule with a long interval can skip a whole period before its first date.
  const reach = (recurrence.interval * DAYS_PER_STEP[recurrence.frequency] + 62) * DAY_MS;
  const [first] = ruleStarts(rrule, anchorMs, timezone, anchorMs, anchorMs + reach);
  if (first === undefined) throw new RangeError('recurrence_has_no_occurrence');
  if (first === anchorMs) return { startAt, dueAt };

  const moved = new Date(first).toISOString();
  if (schedule.scheduleType !== 'deadline') return { startAt: moved, dueAt };
  if (startAt === null) return { startAt: null, dueAt: moved };

  const days = Math.round(
    (wallClockOf(timezone, first) - wallClockOf(timezone, anchorMs)) / DAY_MS,
  );
  if (dueAt === null) return { startAt: moved, dueAt };
  const due = instantOf(timezone, wallClockOf(timezone, Date.parse(dueAt)) + days * DAY_MS);
  return { startAt: moved, dueAt: new Date(due).toISOString() };
}
