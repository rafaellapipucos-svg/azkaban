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
  | 'invalid_transition'
  | 'forbidden'
  | 'reason_required'
  | 'late_window_expired'
  | 'proof_required'
  | 'proof_disputed'
>;

export type TransitionResult = { ok: true; late: boolean } | { ok: false; error: TransitionError };

/** Rules come in as parameters because core does not import config. */
export type TransitionRequest = {
  occurrence: Pick<Occurrence, 'status' | 'overdueAt' | 'proofReviewStatus'>;
  to: OccurrenceStatus;
  /** From `deriveActors`. */
  actors: readonly OccurrenceActor[];
  reason: string | null;
  /** `tasks.requires_partial_reason`. */
  requiresPartialReason: boolean;
  /** `tasks.requires_photo_proof`: green only comes from a proof, never from this check (ADR-0007). */
  requiresPhotoProof: boolean;
  /** From `canReviewProof`. A disputed occurrence only moves for who can review it. */
  canReviewProof: boolean;
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
  // A dispute stands until a reviewer undoes it, then a photo is missing: same order as the RPC.
  if (occurrence.proofReviewStatus === 'disputed' && !request.canReviewProof) {
    return { ok: false, error: 'proof_disputed' };
  }
  if (to === 'done' && request.requiresPhotoProof) return { ok: false, error: 'proof_required' };
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
 * Same order as the RPC (ADR-0005 section 5, ADR-0007 section 9): pair, actor, dispute, proof,
 * reason, window. Quick answer for the UI.
 * `late` is what the database will record: true for done or partial after `overdueAt`.
 */
export function canTransition(request: TransitionRequest): TransitionResult {
  return check(request, request.reason !== null && request.reason.trim().length > 0);
}

/**
 * Whether the user may send a photo for this occurrence now: the camera is the only road to green
 * on a task that asks for one, and only the assignee takes it (ADR-0007 section 9). Same checks as
 * `done` without the proof barrier, so a closed late window or a dispute hides it too. The server
 * still decides when the photo arrives.
 */
export function canSendProof(request: Omit<TransitionRequest, 'to' | 'reason'>): boolean {
  if (!request.requiresPhotoProof || !request.actors.includes('assignee')) return false;
  return check({ ...request, to: 'done', reason: null, requiresPhotoProof: false }, true).ok;
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
