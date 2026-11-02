import type { OccurrenceListItem } from '@azkaban/contracts';
import { DAY_MS, dateOfWall, instantOf, localDateOf, wallMidnight } from '../recurrence/zone';
import { isOverdue, isStillResolvable } from './late';
import { occurrenceXp, type XpRules } from './xp';

/** `[from, to)` of `days` local days starting at the local midnight of `at`, in `timezone`. */
export function localDayRange(timezone: string, at: Date, days = 1) {
  const date = localDateOf(timezone, at.getTime());
  const start = wallMidnight(date);
  return {
    date,
    from: new Date(instantOf(timezone, start)).toISOString(),
    to: new Date(instantOf(timezone, start + days * DAY_MS)).toISOString(),
  };
}

/** The viewer's side of the late window: `canManageGroup` answers per group of the task. */
export type OverdueRules = {
  lateCompletionWindowHours: number;
  canManageGroup: (groupId: string | null) => boolean;
};

function listsAsOverdue(item: OccurrenceListItem, now: Date, rules: OverdueRules) {
  return (
    isOverdue(item, now) ||
    isStillResolvable(item, now, {
      lateCompletionWindowHours: rules.lateCompletionWindowHours,
      canManageGroup: rules.canManageGroup(item.task.groupId),
    })
  );
}

export type TodayPlan = {
  /** Past `overdueAt` and still to do: pending, or red and still resolvable. Oldest first. */
  overdue: OccurrenceListItem[];
  /** The day's own list, resolved ones included, in time order. */
  today: OccurrenceListItem[];
  /** Pending deadlines that fall due after today, within the window, nearest first. */
  soon: OccurrenceListItem[];
  /** The daily goal: green ones out of everything planned for today. */
  goal: { done: number; total: number };
};

/**
 * What the start screen shows. A deadline belongs to the day it falls due, not the day it
 * started, so a long one only comes up here when it is near. Cancelled ones are gone.
 * A red one stays among the overdue while the viewer can still resolve it, then leaves.
 */
export function planToday(
  items: readonly OccurrenceListItem[],
  {
    now,
    timezone,
    dueSoonDays,
    ...late
  }: { now: Date; timezone: string; dueSoonDays: number } & OverdueRules,
): TodayPlan {
  const today = localDateOf(timezone, now.getTime());
  const lastSoonDay = dateOfWall(wallMidnight(today) + dueSoonDays * DAY_MS);
  const seen = new Set<string>();
  const plan: TodayPlan = { overdue: [], today: [], soon: [], goal: { done: 0, total: 0 } };

  for (const item of items) {
    if (seen.has(item.id) || item.status === 'cancelled') continue;
    seen.add(item.id);
    if (listsAsOverdue(item, now, late)) {
      plan.overdue.push(item);
      continue;
    }
    const deadline = item.task.scheduleType === 'deadline';
    const day = localDateOf(
      timezone,
      Date.parse(deadline ? item.scheduledDue : item.scheduledStart),
    );
    if (day === today) plan.today.push(item);
    else if (deadline && item.status === 'pending' && day > today && day <= lastSoonDay) {
      plan.soon.push(item);
    }
  }

  const byStart = (a: OccurrenceListItem, b: OccurrenceListItem) =>
    Date.parse(a.scheduledStart) - Date.parse(b.scheduledStart);
  plan.overdue.sort(byStart);
  plan.today.sort(byStart);
  plan.soon.sort((a, b) => Date.parse(a.scheduledDue) - Date.parse(b.scheduledDue));
  plan.goal = {
    done: plan.today.filter(({ status }) => status === 'done').length,
    total: plan.today.length,
  };
  return plan;
}

export type AreaPlan = {
  overdue: OccurrenceListItem[];
  /** One entry per local day, nearest first. A deadline sits on the day it falls due. */
  days: { date: string; items: OccurrenceListItem[] }[];
};

/** The list of an area tab: what is overdue, then everything ahead day by day. */
export function planArea(
  items: readonly OccurrenceListItem[],
  { now, timezone, ...late }: { now: Date; timezone: string } & OverdueRules,
): AreaPlan {
  const today = localDateOf(timezone, now.getTime());
  const seen = new Set<string>();
  const overdue: OccurrenceListItem[] = [];
  const byDay = new Map<string, OccurrenceListItem[]>();

  for (const item of items) {
    if (seen.has(item.id) || item.status === 'cancelled') continue;
    seen.add(item.id);
    if (listsAsOverdue(item, now, late)) {
      overdue.push(item);
      continue;
    }
    const anchor = item.task.scheduleType === 'deadline' ? item.scheduledDue : item.scheduledStart;
    const day = localDateOf(timezone, Date.parse(anchor));
    if (day < today) continue;
    byDay.set(day, [...(byDay.get(day) ?? []), item]);
  }

  const byStart = (a: OccurrenceListItem, b: OccurrenceListItem) =>
    Date.parse(a.scheduledStart) - Date.parse(b.scheduledStart);
  return {
    overdue: overdue.sort(byStart),
    days: [...byDay]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, dayItems]) => ({ date, items: dayItems.sort(byStart) })),
  };
}

/** Keeps the order of first appearance, so the sections follow the time of their first item. */
export function groupByContext(
  items: readonly OccurrenceListItem[],
): { contextId: string; items: OccurrenceListItem[] }[] {
  const groups = new Map<string, OccurrenceListItem[]>();
  for (const item of items) {
    const group = groups.get(item.task.contextId);
    if (group) group.push(item);
    else groups.set(item.task.contextId, [item]);
  }
  return [...groups].map(([contextId, grouped]) => ({ contextId, items: grouped }));
}

/** Display only, as in `occurrenceXp`: what the user's resolved occurrences are worth. */
export function earnedXp(
  items: readonly OccurrenceListItem[],
  userId: string,
  rules: XpRules,
): number {
  return items
    .filter(({ assigneeId }) => assigneeId === userId)
    .reduce(
      (sum, item) =>
        sum +
        occurrenceXp(
          {
            status: item.status,
            late: item.late,
            difficulty: item.task.difficulty,
            proofReviewStatus: item.proofReviewStatus,
          },
          rules,
        ),
      0,
    );
}
