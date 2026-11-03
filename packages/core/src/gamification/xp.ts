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
 * Room left under the cap (ADR-0010, sections 2 and 14), from the events written in the last
 * `capWindowHours`, the same rule the database applies in `occurrence_award_xp`: the capped reasons
 * are summed per (occurrence, group), the event itself standing for an occurrence when it has none;
 * each pair counts at no less than zero, and the room is `min(cap, max(0, cap − balance))`. Undoing
 * XP earned in the window frees its room; undoing XP from before it is not credit, and neither is
 * private XP reopened to be redone in a group (SEG6-3). 0 means the cap was reached.
 */
export function capRoom(
  eventsInWindow: readonly Pick<XpEvent, 'id' | 'occurrenceId' | 'groupId' | 'reason' | 'amount'>[],
  dailyCap: number,
): number {
  const net = new Map<string, number>();
  for (const { id, occurrenceId, groupId, reason, amount } of eventsInWindow) {
    if (!capped.has(reason)) continue;
    // Ids are uuids, so a space never collides.
    const key = `${occurrenceId ?? id} ${groupId ?? ''}`;
    net.set(key, (net.get(key) ?? 0) + amount);
  }
  let balance = 0;
  for (const value of net.values()) balance += Math.max(0, value);
  return Math.min(dailyCap, Math.max(0, dailyCap - balance));
}

/** What the cap lets through: the base first, then the bonus with what is left. */
export function applyCap({ base, proofBonus }: OccurrenceAward, room: number): OccurrenceAward {
  const cappedBase = Math.min(base, room);
  return { base: cappedBase, proofBonus: Math.min(proofBonus, room - cappedBase) };
}
