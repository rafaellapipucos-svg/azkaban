import type { OccurrenceListItem, OccurrenceStatus } from '@azkaban/contracts';
import { localDateOf } from '../recurrence/zone';
import { localTimeOf } from './form';

/** The statuses a calendar day can hold. Cancelled occurrences are not part of the calendar. */
export type CalendarStatus = Exclude<OccurrenceStatus, 'cancelled'>;

export const calendarStatuses: readonly CalendarStatus[] = ['pending', 'done', 'partial', 'missed'];

export type CalendarFilter = {
  areaId: string | null;
  contextId: string | null;
  status: CalendarStatus | null;
};

export const noFilter: CalendarFilter = { areaId: null, contextId: null, status: null };

export type DaySummary = Record<CalendarStatus, number> & { total: number };

export type DayInfo = {
  date: string;
  /** What the day lists: every filter applied, in time order. */
  items: OccurrenceListItem[];
  /** Counts of `items`. */
  summary: DaySummary;
  /** See `isPerfectDay`. Ignores the status filter, which hides tasks but does not change them. */
  perfect: boolean;
};

/**
 * The local day an occurrence belongs to in the user's zone: a deadline sits on the day it falls
 * due (as in "Hoje"), anything else on the day it starts.
 */
export function occurrenceDay(item: OccurrenceListItem, timezone: string): string {
  const anchor = item.task.scheduleType === 'deadline' ? item.scheduledDue : item.scheduledStart;
  return localDateOf(timezone, Date.parse(anchor));
}

export function summarizeDay(items: readonly OccurrenceListItem[]): DaySummary {
  const summary: DaySummary = { total: 0, pending: 0, done: 0, partial: 0, missed: 0 };
  for (const { status } of items) {
    if (status === 'cancelled') continue;
    summary[status] += 1;
    summary.total += 1;
  }
  return summary;
}

/**
 * "Dia perfeito": everything planned for the day is green. A cancelled occurrence is not planned,
 * so it does not count, and a day left with nothing is not perfect: there is nothing to celebrate.
 * Yellow (`partial`) and red (`missed`) break it. A `done` that came late is still green, because
 * the state is `done`; `late` only lowers its XP (ADR-0005).
 */
export function isPerfectDay(summary: DaySummary): boolean {
  return summary.total > 0 && summary.done === summary.total;
}

export function emptyDay(date: string): DayInfo {
  const summary = summarizeDay([]);
  return { date, items: [], summary, perfect: isPerfectDay(summary) };
}

const byStart = (a: OccurrenceListItem, b: OccurrenceListItem) =>
  Date.parse(a.scheduledStart) - Date.parse(b.scheduledStart) || a.id.localeCompare(b.id);

/**
 * Groups occurrences by local day. A repeated id counts once and cancelled ones are dropped.
 * Area and context narrow which tasks the view is about, so they also decide the perfect day;
 * the status filter only narrows what is listed.
 */
export function buildDays(
  items: readonly OccurrenceListItem[],
  { timezone, filter = noFilter }: { timezone: string; filter?: CalendarFilter },
): Map<string, DayInfo> {
  const seen = new Set<string>();
  const scoped = new Map<string, OccurrenceListItem[]>();
  for (const item of items) {
    if (seen.has(item.id) || item.status === 'cancelled') continue;
    seen.add(item.id);
    if (filter.areaId && item.areaId !== filter.areaId) continue;
    if (filter.contextId && item.task.contextId !== filter.contextId) continue;
    const date = occurrenceDay(item, timezone);
    scoped.set(date, [...(scoped.get(date) ?? []), item]);
  }
  const days = new Map<string, DayInfo>();
  for (const [date, all] of scoped) {
    const listed = (filter.status ? all.filter(({ status }) => status === filter.status) : all)
      .slice()
      .sort(byStart);
    days.set(date, {
      date,
      items: listed,
      summary: summarizeDay(listed),
      perfect: isPerfectDay(summarizeDay(all)),
    });
  }
  return days;
}

export type DayTimeline = {
  /** Deadlines that fall due on the day. */
  deadlines: OccurrenceListItem[];
  allDay: OccurrenceListItem[];
  /** 24 slots by the local hour a timed occurrence starts. */
  hours: OccurrenceListItem[][];
};

/** Lays the items of one day on the hours of the user's clock. */
export function dayTimeline(items: readonly OccurrenceListItem[], timezone: string): DayTimeline {
  const timeline: DayTimeline = {
    deadlines: [],
    allDay: [],
    hours: Array.from({ length: 24 }, () => []),
  };
  for (const item of [...items].sort(byStart)) {
    if (item.task.scheduleType === 'deadline') timeline.deadlines.push(item);
    else if (item.task.scheduleType === 'all_day') timeline.allDay.push(item);
    else timeline.hours[Number(localTimeOf(timezone, item.scheduledStart).slice(0, 2))]!.push(item);
  }
  timeline.deadlines.sort((a, b) => Date.parse(a.scheduledDue) - Date.parse(b.scheduledDue));
  return timeline;
}
