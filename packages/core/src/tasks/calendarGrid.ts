import { DAY_MS, instantOf, wallMidnight } from '../recurrence/zone';
import { addDays } from './form';

// Date arithmetic for the calendar on `yyyy-MM-dd` strings. A date is a label on the user's own
// calendar, so none of this depends on the device zone: the arithmetic runs on floating midnights
// (`wallMidnight`), and only `dayRange` turns days into instants, with `Intl`.

export type CalendarView = 'month' | 'week' | 'day';

/** 0 is Sunday, as in `Date#getUTCDay`. */
export type WeekStart = 0 | 1 | 2 | 3 | 4 | 5 | 6;

/** Sunday-first weekday number of a `yyyy-MM-dd` date. */
export const weekdayIndex = (date: string) => new Date(wallMidnight(date)).getUTCDay();

/** `yyyy-MM` of a date. */
export const monthOf = (date: string) => date.slice(0, 7);

/** The month `delta` months from `month` (`yyyy-MM`). */
export function addMonths(month: string, delta: number): string {
  const [year, number] = month.split('-').map(Number) as [number, number];
  const index = year * 12 + (number - 1) + delta;
  return `${String(Math.floor(index / 12)).padStart(4, '0')}-${String((index % 12) + 1).padStart(2, '0')}`;
}

export const firstOfMonth = (month: string) => `${month}-01`;

export const lastOfMonth = (month: string) => addDays(firstOfMonth(addMonths(month, 1)), -1);

/** First day of the week that holds `date`. */
export function startOfWeek(date: string, weekStartsOn: WeekStart): string {
  return addDays(date, -((weekdayIndex(date) - weekStartsOn + 7) % 7));
}

/** The seven days of the week that holds `date`. */
export function weekDays(date: string, weekStartsOn: WeekStart): string[] {
  const first = startOfWeek(date, weekStartsOn);
  return Array.from({ length: 7 }, (_, offset) => addDays(first, offset));
}

export type MonthCell = { date: string; inMonth: boolean };

/**
 * The weeks that show `month`, each with seven cells. The first and last week borrow days of the
 * neighbouring months, flagged `inMonth: false`. A month that starts on the first day of the week
 * and has 28 days takes exactly four rows; the others take five or six.
 */
export function monthGrid(month: string, weekStartsOn: WeekStart): MonthCell[][] {
  const first = startOfWeek(firstOfMonth(month), weekStartsOn);
  const last = lastOfMonth(month);
  const weeks: MonthCell[][] = [];
  for (let start = first; start <= last; start = addDays(start, 7)) {
    weeks.push(
      Array.from({ length: 7 }, (_, offset) => {
        const date = addDays(start, offset);
        return { date, inMonth: monthOf(date) === month };
      }),
    );
  }
  return weeks;
}

/** The date `delta` views away. A month keeps the day number, or the last day of a shorter one. */
export function shiftDate(view: CalendarView, date: string, delta: number): string {
  if (view === 'day') return addDays(date, delta);
  if (view === 'week') return addDays(date, delta * 7);
  const month = addMonths(monthOf(date), delta);
  const day = Math.min(Number(date.slice(8, 10)), Number(lastOfMonth(month).slice(8, 10)));
  return `${month}-${String(day).padStart(2, '0')}`;
}

/** First and last day a view draws, the borrowed days of the month grid included. */
export function visibleRange(
  view: CalendarView,
  date: string,
  weekStartsOn: WeekStart,
): { first: string; last: string } {
  if (view === 'day') return { first: date, last: date };
  if (view === 'week') {
    const days = weekDays(date, weekStartsOn);
    return { first: days[0]!, last: days[6]! };
  }
  const weeks = monthGrid(monthOf(date), weekStartsOn);
  return { first: weeks[0]![0]!.date, last: weeks[weeks.length - 1]![6]!.date };
}

/**
 * `[from, to)` as instants covering the local days `first` to `last`, in `timezone`. A day is the
 * span between two local midnights, so it is 23 or 25 hours long where the clocks change, and the
 * edges follow the user's zone rather than the device's or UTC.
 */
export function dayRange(timezone: string, first: string, last: string) {
  const at = (date: string) => new Date(instantOf(timezone, wallMidnight(date))).toISOString();
  return { from: at(first), to: at(addDays(last, 1)) };
}

/** Whole days from `from` to `to` (`yyyy-MM-dd`), negative when `to` is earlier. */
export const daysBetween = (from: string, to: string) =>
  Math.round((wallMidnight(to) - wallMidnight(from)) / DAY_MS);
