import {
  occurrenceTransitions,
  type Occurrence,
  type OccurrenceActor,
  type OccurrenceStatus,
  type TaskErrorCode,
} from '@azkaban/contracts';
import { isLate, isLateWindowOpen } from './late';

/** The error codes this check can produce: the same ones the RPC raises. */
export type TransitionError = Extract<
  TaskErrorCode,
  'invalid_transition' | 'forbidden' | 'reason_required' | 'late_window_expired'
>;

export type TransitionResult = { ok: true; late: boolean } | { ok: false; error: TransitionError };

/** Rules come in as parameters because core does not import config. */
export type TransitionRequest = {
  occurrence: Pick<Occurrence, 'status' | 'overdueAt'>;
  to: OccurrenceStatus;
  /** From `deriveActors`. */
  actors: readonly OccurrenceActor[];
  reason: string | null;
  /** `tasks.requires_partial_reason`. */
  requiresPartialReason: boolean;
  /** `taskRules.lateCompletionWindowHours`. */
  lateCompletionWindowHours: number;
  /** Whether the user has `task.manage_group` in the task's group: no late window. */
  canManageGroup: boolean;
  now: Date;
};

const RESOLVED: readonly OccurrenceStatus[] = ['done', 'partial'];

export function findTransition(from: OccurrenceStatus, to: OccurrenceStatus) {
  return occurrenceTransitions.find((t) => t.from === from && t.to === to);
}

/** Only `partial` can ask for a reason, and only when the task says so. */
export function requiresReason(to: OccurrenceStatus, requiresPartialReason: boolean): boolean {
  return to === 'partial' && requiresPartialReason;
}

function check(request: TransitionRequest, hasReason: boolean): TransitionResult {
  const { occurrence, to, actors, canManageGroup, now } = request;
  const transition = findTransition(occurrence.status, to);
  if (!transition) return { ok: false, error: 'invalid_transition' };
  const allowed: readonly OccurrenceActor[] = transition.actors;
  if (!actors.some((actor) => allowed.includes(actor))) return { ok: false, error: 'forbidden' };
  if (requiresReason(to, request.requiresPartialReason) && !hasReason) {
    return { ok: false, error: 'reason_required' };
  }
  const resolves = RESOLVED.includes(to);
  if (
    resolves &&
    !canManageGroup &&
    !isLateWindowOpen(occurrence.overdueAt, request.lateCompletionWindowHours, now)
  ) {
    return { ok: false, error: 'late_window_expired' };
  }
  // The clock decides, not the previous status, so it does not matter whether a job ran.
  return { ok: true, late: resolves && isLate(occurrence.overdueAt, now) };
}

/**
 * Same order as the RPC (ADR-0005 section 5): pair, actor, reason, window. Quick answer for the UI.
 * `late` is what the database will record: true for done or partial after `overdueAt`.
 */
export function canTransition(request: TransitionRequest): TransitionResult {
  return check(request, request.reason !== null && request.reason.trim().length > 0);
}

/**
 * Destinations to offer as buttons now. A destination that asks for a reason is included, with
 * `requiresReason` set, so the UI can collect it before calling `canTransition`.
 */
export function availableTransitions(
  request: Omit<TransitionRequest, 'to' | 'reason'>,
): { to: OccurrenceStatus; requiresReason: boolean; late: boolean }[] {
  return occurrenceTransitions
    .filter((t) => t.from === request.occurrence.status)
    .flatMap(({ to }) => {
      const result = check({ ...request, to, reason: null }, true);
      return result.ok
        ? [
            {
              to,
              requiresReason: requiresReason(to, request.requiresPartialReason),
              late: result.late,
            },
          ]
        : [];
    });
}
