import type { Occurrence } from '@azkaban/contracts';

const HOUR_MS = 3_600_000;

/** True when `now` is after `overdueAt`. Resolving at the exact instant is still on time. */
export function isLate(overdueAt: string, now: Date): boolean {
  return now.getTime() > Date.parse(overdueAt);
}

/** Last instant at which the assignee can still resolve: `overdueAt` plus the window (ADR-0005). */
export function lateWindowEnd(overdueAt: string, lateCompletionWindowHours: number): Date {
  return new Date(Date.parse(overdueAt) + lateCompletionWindowHours * HOUR_MS);
}

/** The end of the window is inclusive: one millisecond later it has expired. */
export function isLateWindowOpen(
  overdueAt: string,
  lateCompletionWindowHours: number,
  now: Date,
): boolean {
  return now.getTime() <= lateWindowEnd(overdueAt, lateCompletionWindowHours).getTime();
}

/**
 * A pending occurrence past `overdueAt`. The automatic-missed job (F4-6) turns it red a few minutes
 * later; `isStillResolvable` covers it from then on.
 */
export function isOverdue(occurrence: Pick<Occurrence, 'status' | 'overdueAt'>, now: Date) {
  return occurrence.status === 'pending' && isLate(occurrence.overdueAt, now);
}

/**
 * Red, past `overdueAt` and still resolvable by the viewer: inside the late window, or with no
 * window for whoever has `task.manage_group` (ADR-0005 section 1). Same rule as `checkTransition`.
 */
export function isStillResolvable(
  occurrence: Pick<Occurrence, 'status' | 'overdueAt'>,
  now: Date,
  { lateCompletionWindowHours, canManageGroup }: LateRules,
) {
  return (
    occurrence.status === 'missed' &&
    isLate(occurrence.overdueAt, now) &&
    (canManageGroup || isLateWindowOpen(occurrence.overdueAt, lateCompletionWindowHours, now))
  );
}

export type LateRules = { lateCompletionWindowHours: number; canManageGroup: boolean };
