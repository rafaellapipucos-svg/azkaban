import type { OccurrenceListItem } from '@azkaban/contracts';
import { calendarStatuses, localTimeOf, type DayInfo } from '@azkaban/core';

export type Translate = (key: string, options?: Record<string, unknown>) => string;

// A `yyyy-MM-dd` date is a label, not an instant: formatting it at noon UTC keeps the same day on
// any device zone, so these helpers say "UTC" on purpose and never the zone of the user.
const format = (date: string, language: string, options: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat(language, { ...options, timeZone: 'UTC' }).format(
    new Date(`${date}T12:00:00Z`),
  );

export const capitalize = (value: string) => value.charAt(0).toUpperCase() + value.slice(1);

/** "quarta-feira, 4 de novembro" */
export const longDay = (date: string, language: string) =>
  format(date, language, { weekday: 'long', day: 'numeric', month: 'long' });

/** "qua., 4 nov." */
export const shortDay = (date: string, language: string) =>
  format(date, language, { weekday: 'short', day: 'numeric', month: 'short' });

/** "novembro de 2026" */
export const monthTitle = (date: string, language: string) =>
  format(date, language, { month: 'long', year: 'numeric' });

/** "4 nov." */
export const dayMonth = (date: string, language: string) =>
  format(date, language, { day: 'numeric', month: 'short' });

/** "4 nov. de 2026" */
export const dayMonthYear = (date: string, language: string) =>
  format(date, language, { day: 'numeric', month: 'short', year: 'numeric' });

/** "qua." for the head of a month column. */
export const weekdayShort = (date: string, language: string) =>
  format(date, language, { weekday: 'short' });

/** What a screen reader says for a day: the date, the counts, and whether it is perfect. */
export function daySummaryLabel(
  info: DayInfo | undefined,
  date: string,
  { t, language }: { t: Translate; language: string },
): string {
  const label = longDay(date, language);
  if (!info || info.summary.total === 0) return t('day.summary.none', { date: label });
  const parts = calendarStatuses
    .filter((status) => info.summary[status] > 0)
    .map((status) => t(`day.count.${status}`, { count: info.summary[status] }));
  if (info.perfect) parts.push(t('day.summary.perfect'));
  return t('day.summary.some', {
    date: label,
    count: info.summary.total,
    parts: parts.join(', '),
  });
}

/** The "when" of a row inside a day: a time, a time range, "Dia todo" or the deadline time. */
export function whenText(
  item: OccurrenceListItem,
  { t, timezone }: { t: Translate; timezone: string },
): string {
  const time = (instant: string) => localTimeOf(timezone, instant);
  switch (item.task.scheduleType) {
    case 'all_day':
      return t('day.allDay');
    case 'deadline':
      return t('item.dueAt', { time: time(item.scheduledDue) });
    default:
      return item.scheduledDue !== item.scheduledStart
        ? `${time(item.scheduledStart)} – ${time(item.scheduledDue)}`
        : time(item.scheduledStart);
  }
}
