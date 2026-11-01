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
