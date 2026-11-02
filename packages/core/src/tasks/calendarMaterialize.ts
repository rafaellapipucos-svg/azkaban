import { localDateOf } from '../recurrence/zone';
import { dayRange } from './calendarGrid';
import { addDays } from './form';

export type MaterializeNeed = {
  /** Instant to send as `until`, or null when the daily job's window already covers the view. */
  until: string | null;
  /** The last day the app can ask recurring tasks for: today plus `maxDays`. */
  limitDate: string;
  /** The view reaches past `limitDate`, so repeating tasks stop showing before its end. */
  capped: boolean;
};

/**
 * Whether browsing to `lastDate` needs the on-demand materialization (ADR-0005, section 7), and
 * how far to ask. `windowDays` is what the daily job keeps ahead and `maxDays` the most the Edge
 * Function accepts: it cuts a larger `until` silently, so the cap is applied here and the screen
 * can say so instead of showing empty days that look broken.
 */
export function materializationNeed({
  lastDate,
  timezone,
  now,
  windowDays,
  maxDays,
}: {
  lastDate: string;
  timezone: string;
  now: Date;
  windowDays: number;
  maxDays: number;
}): MaterializeNeed {
  const today = localDateOf(timezone, now.getTime());
  const limitDate = addDays(today, maxDays);
  const capped = lastDate > limitDate;
  if (lastDate <= addDays(today, windowDays)) return { until: null, limitDate, capped };
  const reach = capped ? limitDate : lastDate;
  return { until: dayRange(timezone, reach, reach).to, limitDate, capped };
}

export type MaterializeCounts = { inserted: number; failed: number; deferred: number };

/**
 * Calls the materialization again with the same arguments while it answers `deferred > 0` (tasks
 * left over by its CPU budget), at most `maxFollowUps` more times; the daily job does the rest.
 * ADR-0008, section 12. `inserted` adds up, `deferred` is the last answer's. `failed` is the largest
 * seen: a call repeats the tasks that failed before, so adding would count them twice, and the last
 * answer alone could hide them behind a deferral. The screen only asks whether it is above zero.
 */
export async function materializeWithFollowUps(
  call: () => Promise<MaterializeCounts>,
  maxFollowUps: number,
): Promise<MaterializeCounts> {
  let total = await call();
  for (let i = 0; i < maxFollowUps && total.deferred > 0; i++) {
    const next = await call();
    total = {
      inserted: total.inserted + next.inserted,
      failed: Math.max(total.failed, next.failed),
      deferred: next.deferred,
    };
  }
  return total;
}
