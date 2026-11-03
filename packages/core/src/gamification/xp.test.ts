import { cappedXpEventReasons, xpEventReasonSchema } from '@azkaban/contracts';
import { describe, expect, it } from 'vitest';
import type { XpRules } from '../tasks/xp';
import { applyCap, capRoom, occurrenceXpWithBonus } from './xp';

// Same numbers as taskRules.xp and gamificationRules.xp in config, which core does not import.
const rules = {
  xp: {
    status: { done: 10, done_late: 5, partial: 3, missed: 0 },
    difficultyWeight: { easy: 1, medium: 2, hard: 3 },
  } satisfies XpRules,
  proofBonus: 5,
};
const CAP = 300;

describe('occurrenceXpWithBonus (ADR-0010 section 1)', () => {
  const done = { status: 'done', late: false, difficulty: 'medium' } as const;

  it.each(['unreviewed', 'approved'] as const)('adds the bonus to a done with a %s proof', (r) => {
    expect(occurrenceXpWithBonus({ ...done, proofReviewStatus: r }, rules)).toEqual({
      base: 20,
      proofBonus: 5,
    });
    expect(occurrenceXpWithBonus({ ...done, late: true, proofReviewStatus: r }, rules)).toEqual({
      base: 10,
      proofBonus: 5,
    });
  });

  it('gives nothing, bonus included, while the proof is in review', () => {
    expect(occurrenceXpWithBonus({ ...done, proofReviewStatus: 'in_review' }, rules)).toEqual({
      base: 0,
      proofBonus: 0,
    });
  });

  it('gives no bonus without a proof, to a disputed one, or to anything but done', () => {
    expect(occurrenceXpWithBonus({ ...done, proofReviewStatus: null }, rules).proofBonus).toBe(0);
    expect(
      occurrenceXpWithBonus({ ...done, proofReviewStatus: 'disputed' }, rules).proofBonus,
    ).toBe(0);
    expect(
      occurrenceXpWithBonus(
        { status: 'partial', late: false, difficulty: 'hard', proofReviewStatus: 'approved' },
        rules,
      ),
    ).toEqual({ base: 9, proofBonus: 0 });
  });
});

describe('capRoom (ADR-0010 section 2)', () => {
  it('is the whole cap with nothing today', () => {
    expect(capRoom([], CAP)).toBe(CAP);
  });

  it('is zero exactly at the cap, and never negative past it', () => {
    expect(capRoom([{ reason: 'occurrence_done', amount: 300 }], CAP)).toBe(0);
    expect(capRoom([{ reason: 'occurrence_done', amount: 299 }], CAP)).toBe(1);
    expect(capRoom([{ reason: 'occurrence_done', amount: 330 }], CAP)).toBe(0);
  });

  it('leaves the perfect day out', () => {
    expect(
      capRoom(
        [
          { reason: 'occurrence_done', amount: 280 },
          { reason: 'perfect_day', amount: 20 },
          { reason: 'perfect_day_reverted', amount: -20 },
        ],
        CAP,
      ),
    ).toBe(20);
  });

  it('frees room with a compensation written today', () => {
    expect(
      capRoom(
        [
          { reason: 'occurrence_done', amount: 300 },
          { reason: 'occurrence_reverted', amount: -30 },
        ],
        CAP,
      ),
    ).toBe(30);
  });

  it('counts every capped reason and only those', () => {
    for (const reason of xpEventReasonSchema.options) {
      const counted = (cappedXpEventReasons as readonly string[]).includes(reason);
      expect(capRoom([{ reason, amount: 10 }], CAP)).toBe(counted ? 290 : 300);
    }
  });
});

describe('applyCap', () => {
  const award = { base: 20, proofBonus: 5 };

  it('lets everything through with room', () => {
    expect(applyCap(award, 300)).toEqual(award);
    expect(applyCap(award, 25)).toEqual(award);
  });

  it('fills the base first, then the bonus with what is left', () => {
    expect(applyCap(award, 22)).toEqual({ base: 20, proofBonus: 2 });
    expect(applyCap(award, 20)).toEqual({ base: 20, proofBonus: 0 });
    expect(applyCap(award, 7)).toEqual({ base: 7, proofBonus: 0 });
    expect(applyCap(award, 0)).toEqual({ base: 0, proofBonus: 0 });
  });

  it('closes mass XP: a day of many tasks stops at the cap', () => {
    const events: { reason: 'occurrence_done' | 'proof_bonus'; amount: number }[] = [];
    for (let i = 0; i < 40; i += 1) {
      const granted = applyCap({ base: 30, proofBonus: 5 }, capRoom(events, CAP));
      if (granted.base) events.push({ reason: 'occurrence_done', amount: granted.base });
      if (granted.proofBonus) events.push({ reason: 'proof_bonus', amount: granted.proofBonus });
    }
    expect(events.reduce((sum, { amount }) => sum + amount, 0)).toBe(CAP);
  });
});
