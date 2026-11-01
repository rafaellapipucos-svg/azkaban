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
 * Until the automatic-missed job exists (F4-6), a pending occurrence past `overdueAt` is shown as
 * overdue by the client.
 */
export function isOverdue(occurrence: Pick<Occurrence, 'status' | 'overdueAt'>, now: Date) {
  return occurrence.status === 'pending' && isLate(occurrence.overdueAt, now);
}
