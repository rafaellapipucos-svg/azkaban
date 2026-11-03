import {
  cappedXpEventReasons,
  type OccurrenceStatus,
  type ProofReviewStatus,
  type TaskDifficulty,
  type XpEvent,
} from '@azkaban/contracts';
import { occurrenceXp, type XpRules } from '../tasks/xp';

export type OccurrenceAward = { base: number; proofBonus: number };

/**
 * What an occurrence is worth now, for display (ADR-0010 section 1): the base of `occurrenceXp`
 * and, for a `done` (late or not) with a current proof that counts (`unreviewed` or `approved`),
 * the flat `proofBonus`. `in_review` is worth nothing until approved, bonus included.
 */
export function occurrenceXpWithBonus(
  occurrence: {
    status: OccurrenceStatus;
    late: boolean;
    difficulty: TaskDifficulty;
    proofReviewStatus: ProofReviewStatus | null;
  },
  rules: { xp: XpRules; proofBonus: number },
): OccurrenceAward {
  const { status, proofReviewStatus } = occurrence;
  const proven = proofReviewStatus === 'unreviewed' || proofReviewStatus === 'approved';
  return {
    base: occurrenceXp(occurrence, rules.xp),
    proofBonus: status === 'done' && proven ? rules.proofBonus : 0,
  };
}

const capped = new Set<string>(cappedXpEventReasons);

/**
 * Room left under the daily cap (ADR-0010 section 2), from the events written today in the local
 * day of the profile: `max(0, cap − balance of the capped reasons)`. A compensation written today
 * frees room today, even for XP from another day, as the database counts it, but never past the
 * cap: an earlier day's XP undone today is not credit. 0 means the cap was reached.
 */
export function capRoom(
  eventsToday: readonly Pick<XpEvent, 'reason' | 'amount'>[],
  dailyCap: number,
): number {
  let balance = 0;
  for (const { reason, amount } of eventsToday) if (capped.has(reason)) balance += amount;
  return Math.min(dailyCap, Math.max(0, dailyCap - balance));
}

/** What the cap lets through: the base first, then the bonus with what is left. */
export function applyCap({ base, proofBonus }: OccurrenceAward, room: number): OccurrenceAward {
  const cappedBase = Math.min(base, room);
  return { base: cappedBase, proofBonus: Math.min(proofBonus, room - cappedBase) };
}
