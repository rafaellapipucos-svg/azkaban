// Wall-clock helpers on Intl only: no Node API, so this runs in a Deno Edge Function too.
// date-fns-tz was tried and rejected: getTimezoneOffset is wrong near DST changes and
// fromZonedTime depends on the machine's own zone for the repeated hour (checked 3.2.0).

export const DAY_MS = 86_400_000;

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatter(timezone: string) {
  let format = formatters.get(timezone);
  if (!format) {
    format = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hourCycle: 'h23',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
    });
    formatters.set(timezone, format);
  }
  return format;
}

/**
 * A "floating" time: an epoch-ms number whose UTC fields are the wall clock of `timezone` at that
 * instant. This is what `rrule` expands, so 9am stays 9am when the offset changes.
 */
export function wallClockOf(timezone: string, instantMs: number): number {
  const part: Record<string, number> = {};
  for (const { type, value } of formatter(timezone).formatToParts(new Date(instantMs))) {
    part[type] = Number(value);
  }
  const wall = Date.UTC(
    part.year!,
    part.month! - 1,
    part.day!,
    part.hour! % 24,
    part.minute!,
    part.second!,
  );
  // Whole seconds only: the formatter drops milliseconds.
  return wall + (((instantMs % 1000) + 1000) % 1000);
}

const offsetAt = (timezone: string, instantMs: number) =>
  wallClockOf(timezone, instantMs) - instantMs;

/**
 * The instant at which `timezone` shows the floating time `wallMs`. A time that happens twice
 * (clocks go back) resolves to the first; one that never happens (clocks go forward) moves
 * forward by the gap, so 02:30 becomes 03:30.
 */
export function instantOf(timezone: string, wallMs: number): number {
  const before = offsetAt(timezone, wallMs - DAY_MS);
  const after = offsetAt(timezone, wallMs + DAY_MS);
  const first = wallMs - before;
  if (before === after) return first;
  const second = wallMs - after;
  const firstValid = offsetAt(timezone, first) === before;
  const secondValid = offsetAt(timezone, second) === after;
  if (firstValid && secondValid) return Math.min(first, second);
  return secondValid ? second : first;
}

/** `YYYY-MM-DD` of a floating time. */
export const dateOfWall = (wallMs: number) => new Date(wallMs).toISOString().slice(0, 10);

/** Local date, in `timezone`, of an instant. */
export const localDateOf = (timezone: string, instantMs: number) =>
  dateOfWall(wallClockOf(timezone, instantMs));

/** Floating midnight of a `YYYY-MM-DD` date. */
export const wallMidnight = (date: string) => Date.parse(`${date}T00:00:00Z`);
