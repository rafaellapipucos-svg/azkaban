import type { OccurrenceListItem, RecurrenceInput, TaskErrorCode } from '@azkaban/contracts';
import { addDays, localDateOf, localTimeOf } from '@azkaban/core';

export type Translate = (key: string, options?: Record<string, unknown>) => string;

/** "hoje", "amanhã" or "sex., 6 nov." for a `yyyy-MM-dd` date, on the user's calendar. */
export function dayLabel(date: string, today: string, t: Translate, language: string): string {
  if (date === today) return t('days.today');
  if (date === addDays(today, 1)) return t('days.tomorrow');
  return new Intl.DateTimeFormat(language, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  }).format(new Date(`${date}T12:00:00Z`));
}

export const capitalize = (value: string) => value.charAt(0).toUpperCase() + value.slice(1);

/** The "when" line of a row: a time, "dia todo" or the deadline. */
export function whenText(
  item: OccurrenceListItem,
  { t, timezone, now, language }: { t: Translate; timezone: string; now: Date; language: string },
): string {
  const today = localDateOf(timezone, now.getTime());
  const time = (instant: string) => localTimeOf(timezone, instant);
  // Anything not today says which day first: an overdue row would otherwise show only "12:00".
  const startDay = localDateOf(timezone, Date.parse(item.scheduledStart));
  const prefix = startDay === today ? '' : `${dayLabel(startDay, today, t, language)}, `;
  switch (item.task.scheduleType) {
    case 'all_day':
      return `${prefix}${t('when.allDay')}`;
    case 'deadline': {
      const due = localDateOf(timezone, Date.parse(item.scheduledDue));
      return due === today
        ? t('when.dueTodayAt', { time: time(item.scheduledDue) })
        : t('when.dueOn', { day: dayLabel(due, today, t, language) });
    }
    default:
      return `${prefix}${
        item.scheduledDue !== item.scheduledStart
          ? t('when.range', { from: time(item.scheduledStart), to: time(item.scheduledDue) })
          : time(item.scheduledStart)
      }`;
  }
}

/** "Na hora", "30 min antes", "1 hora antes", "1 dia antes". */
export function reminderLabel(minutes: number, t: Translate): string {
  if (minutes === 0) return t('reminder.atTime');
  if (minutes % 1440 === 0) return t('reminder.days', { count: minutes / 1440 });
  if (minutes % 60 === 0) return t('reminder.hours', { count: minutes / 60 });
  return t('reminder.minutes', { count: minutes });
}

const WEEKDAY_KEYS = {
  MO: 'mon',
  TU: 'tue',
  WE: 'wed',
  TH: 'thu',
  FR: 'fri',
  SA: 'sat',
  SU: 'sun',
};

/** A recurrence in plain words: "Todo dia", "Toda seg. e qua.", "Todo dia 5 do mês". */
export function describeRecurrence(recurrence: RecurrenceInput, t: Translate): string {
  const { frequency, interval, weekdays, monthDay, end } = recurrence;
  const base =
    frequency === 'daily'
      ? t('repeat.summary.daily', { count: interval })
      : frequency === 'weekly'
        ? t('repeat.summary.weekly', {
            count: interval,
            days: weekdays.map((day) => t(`weekdaysShort.${WEEKDAY_KEYS[day]}`)).join(', '),
          })
        : t('repeat.summary.monthly', { count: interval, day: monthDay });
  const ending =
    end.type === 'never'
      ? ''
      : end.type === 'after_count'
        ? t('repeat.summary.afterCount', { count: end.count })
        : t('repeat.summary.onDate', { date: end.date.split('-').reverse().join('/') });
  return ending ? `${base}, ${ending}` : base;
}

/** Messages from core that the form can show: the ones a user can fix. */
const FORM_ERRORS = new Set([
  'recurrence_ends_before_anchor',
  'recurrence_has_no_occurrence',
  'count_before_pivot',
]);

export function formErrorKey(error: unknown): string | null {
  return error instanceof RangeError && FORM_ERRORS.has(error.message)
    ? `formErrors.${error.message}`
    : null;
}

/** Key of the message for a database refusal. Codes the UI cannot act on get the generic text. */
export const errorKey = (code: TaskErrorCode | 'generic' | null) => `errors.${code ?? 'generic'}`;
