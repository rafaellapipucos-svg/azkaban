import type { RecurrenceInput, Task } from '@azkaban/contracts';
import { ruleStarts, taskAnchor } from './expand';
import { fromRRule, toRRule } from './rrule';
import { DAY_MS, dateOfWall, localDateOf, wallMidnight } from './zone';

export type SplitResult = {
  /** The original series, now ending before the pivot. Null when the pivot is its first occurrence. */
  headRrule: string | null;
  /** The new series from the pivot on, anchored at the pivot. */
  tailRrule: string;
};

/**
 * `this_and_following` (ADR-0005 section 8). The head ends at the end of the local day before the
 * pivot, which is "just before" because a rule has one occurrence per local day; this also keeps
 * `fromRRule` of the head reading as a plain date. An original COUNT becomes that end date.
 *
 * `tailRecurrence.end` of type `after_count` counts occurrences of the whole series, the way the
 * editor shows them: the tail gets what remains after the occurrences before the pivot. The
 * occurrences before the pivot are counted with `exdates` included, as RFC 5545 counts COUNT.
 *
 * @param pivotStart `scheduled_start` of the occurrence being edited, as an ISO instant
 * @throws RangeError `count_before_pivot` when the new count is not past the pivot
 */
export function splitRecurrence(
  task: Pick<Task, 'rrule' | 'startAt' | 'dueAt' | 'timezone'>,
  pivotStart: string,
  tailRecurrence: RecurrenceInput,
): SplitResult {
  const { timezone } = task;
  const anchor = taskAnchor(task);
  const anchorMs = Date.parse(anchor);
  const pivotMs = Date.parse(pivotStart);

  // Every occurrence of the original series before the pivot, from the anchor.
  const before = ruleStarts(task.rrule, anchorMs, timezone, anchorMs - DAY_MS, pivotMs);

  let end = tailRecurrence.end;
  if (end.type === 'after_count') {
    const remaining = end.count - before.length;
    if (remaining < 1) throw new RangeError('count_before_pivot');
    end = { type: 'after_count', count: remaining };
  }
  const tailRrule = toRRule({ ...tailRecurrence, end }, pivotStart, timezone);

  if (task.rrule === null || before.length === 0) return { headRrule: null, tailRrule };

  const dayBefore = dateOfWall(wallMidnight(localDateOf(timezone, pivotMs)) - DAY_MS);
  const headRrule = toRRule(
    { ...fromRRule(task.rrule, timezone), end: { type: 'on_date', date: dayBefore } },
    anchor,
    timezone,
  );
  return { headRrule, tailRrule };
}
