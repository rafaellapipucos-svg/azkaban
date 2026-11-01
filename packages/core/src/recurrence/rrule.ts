import type { RecurrenceInput, Weekday } from '@azkaban/contracts';
import { RRule, type Options } from 'rrule';
import { DAY_MS, instantOf, localDateOf, wallMidnight } from './zone';

/**
 * `RecurrenceInput` <-> RRULE string (ADR-0005 section 7). The string has no DTSTART: the anchor is
 * `coalesce(start_at, due_at)` and the zone is `tasks.timezone`. Nothing outside core reads it.
 *
 * Month days 29 to 31 become `BYMONTHDAY=28,...,d;BYSETPOS=-1`: the last of those days that the
 * month has, so "every 31st" lands on Feb 28 or 29 instead of skipping the month. It is plain
 * RFC 5545, so the future .ics export needs no translation.
 */

const WEEKDAYS: readonly Weekday[] = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'];
const FREQ = { daily: 'DAILY', weekly: 'WEEKLY', monthly: 'MONTHLY' } as const;
const SUPPORTED_KEYS = new Set(['freq', 'interval', 'byweekday', 'bymonthday', 'bysetpos']);

const pad = (n: number) => String(n).padStart(2, '0');

function formatUntil(instantMs: number): string {
  const d = new Date(instantMs);
  return (
    `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}` +
    `T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`
  );
}

/** End of the local day: a rule ending on a date includes the occurrence of that day. */
export function endOfLocalDay(timezone: string, date: string): number {
  return instantOf(timezone, wallMidnight(date) + DAY_MS - 1000);
}

/**
 * @param anchor `coalesce(start_at, due_at)` of the task, as an ISO instant. Only used to refuse
 * a rule that ends before it starts.
 * @throws RangeError `recurrence_ends_before_anchor`
 */
export function toRRule(recurrence: RecurrenceInput, anchor: string, timezone: string): string {
  const { frequency, interval, weekdays, monthDay, end } = recurrence;
  const parts: string[] = [`FREQ=${FREQ[frequency]}`];
  if (interval > 1) parts.push(`INTERVAL=${interval}`);

  if (frequency === 'weekly') {
    const sorted = WEEKDAYS.filter((day) => weekdays.includes(day));
    parts.push(`BYDAY=${sorted.join(',')}`);
  }
  if (frequency === 'monthly' && monthDay !== null) {
    if (monthDay <= 28) {
      parts.push(`BYMONTHDAY=${monthDay}`);
    } else {
      const days = Array.from({ length: monthDay - 27 }, (_, i) => 28 + i);
      parts.push(`BYMONTHDAY=${days.join(',')}`, 'BYSETPOS=-1');
    }
  }

  if (end.type === 'after_count') parts.push(`COUNT=${end.count}`);
  if (end.type === 'on_date') {
    if (end.date < localDateOf(timezone, Date.parse(anchor))) {
      throw new RangeError('recurrence_ends_before_anchor');
    }
    parts.push(`UNTIL=${formatUntil(endOfLocalDay(timezone, end.date))}`);
  }
  return parts.join(';');
}

const toList = <T>(value: T | T[] | null | undefined): T[] =>
  value === null || value === undefined ? [] : Array.isArray(value) ? value : [value];

function monthDayOf(options: Partial<Options>): number {
  const days = toList(options.bymonthday);
  const [first] = days;
  if (first === undefined) throw new RangeError('unsupported_rrule');
  const setPos = toList(options.bysetpos);
  if (setPos.length === 0 && days.length === 1 && first <= 28) return first;
  const last = days[days.length - 1]!;
  const contiguousFrom28 = days.every((day, i) => day === 28 + i);
  if (setPos.length === 1 && setPos[0] === -1 && contiguousFrom28 && last >= 29) return last;
  throw new RangeError('unsupported_rrule');
}

/**
 * Inverse of `toRRule` for the rules the app generates, with weekdays in Monday-first order.
 * `UNTIL` comes back as the local date in `timezone`.
 * @throws RangeError `unsupported_rrule` for anything else (yearly, BYSETPOS elsewhere, ...)
 */
export function fromRRule(rrule: string, timezone: string): RecurrenceInput {
  const options = RRule.parseString(rrule);
  if (Object.keys(options).some((key) => !SUPPORTED_KEYS.has(key) && !isEnd(key))) {
    throw new RangeError('unsupported_rrule');
  }

  const frequency =
    options.freq === RRule.DAILY
      ? 'daily'
      : options.freq === RRule.WEEKLY
        ? 'weekly'
        : options.freq === RRule.MONTHLY
          ? 'monthly'
          : null;
  if (frequency === null) throw new RangeError('unsupported_rrule');

  const weekdayIndexes = toList(options.byweekday).map((day) => {
    if (typeof day === 'number') return day;
    if (typeof day === 'string') return WEEKDAYS.indexOf(day as Weekday);
    if (day.n !== undefined && day.n !== null) throw new RangeError('unsupported_rrule');
    return day.weekday;
  });
  const weekdays = WEEKDAYS.filter((_, index) => weekdayIndexes.includes(index));
  const hasMonthRule = options.bymonthday !== undefined || options.bysetpos !== undefined;
  if ((frequency === 'weekly') !== weekdays.length > 0) throw new RangeError('unsupported_rrule');
  if ((frequency === 'monthly') !== hasMonthRule) throw new RangeError('unsupported_rrule');

  return {
    frequency,
    interval: options.interval ?? 1,
    weekdays: frequency === 'weekly' ? weekdays : [],
    monthDay: frequency === 'monthly' ? monthDayOf(options) : null,
    end: options.count
      ? { type: 'after_count', count: options.count }
      : options.until
        ? { type: 'on_date', date: localDateOf(timezone, options.until.getTime()) }
        : { type: 'never' },
  };
}

const isEnd = (key: string) => key === 'count' || key === 'until';
