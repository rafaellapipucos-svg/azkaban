import { cappedXpEventReasons, xpEventReasonSchema, type XpEventReason } from '@azkaban/contracts';
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

describe('capRoom (ADR-0010 sections 2 and 14)', () => {
  let seq = 0;
  // An event in the window; `occ` null is an event without occurrence, counted on its own.
  const ev = (
    reason: XpEventReason,
    amount: number,
    occ: string | null = `occ-${++seq}`,
    groupId: string | null = null,
  ) => ({ id: `event-${++seq}`, occurrenceId: occ, groupId, reason, amount });

  it('is the whole cap with nothing today', () => {
    expect(capRoom([], CAP)).toBe(CAP);
  });

  it('is zero exactly at the cap, and never negative past it', () => {
    expect(capRoom([ev('occurrence_done', 300)], CAP)).toBe(0);
    expect(capRoom([ev('occurrence_done', 299)], CAP)).toBe(1);
    expect(capRoom([ev('occurrence_done', 200), ev('occurrence_done', 130)], CAP)).toBe(0);
  });

  it('leaves the perfect day out', () => {
    const day = [ev('perfect_day', 20, null), ev('perfect_day_reverted', -20, null)];
    expect(capRoom([ev('occurrence_done', 280), ...day], CAP)).toBe(20);
  });

  it('counts an event without occurrence on its own', () => {
    expect(
      capRoom([ev('shopping_completed', 10, null), ev('shopping_completed', 10, null)], CAP),
    ).toBe(280);
  });

  it('frees room when something done today is undone today', () => {
    const done = [ev('occurrence_done', 270), ev('occurrence_done', 30, 'A')];
    expect(capRoom([...done, ev('occurrence_reverted', -30, 'A')], CAP)).toBe(30);
  });

  it('gives no credit for XP from another day undone today (handoff 0328)', () => {
    // A was +300 yesterday, outside these events; reopened today it nets -300, floored at zero.
    expect(capRoom([ev('occurrence_reverted', -300, 'A')], CAP)).toBe(CAP);
    const b = ev('occurrence_done', 30, 'B');
    expect(capRoom([ev('occurrence_reverted', -300, 'A'), b], CAP)).toBe(270);
    const c = ev('occurrence_done', 100);
    expect(capRoom([c, ev('occurrence_reverted', -300, 'A')], CAP)).toBe(200);
  });

  it('writes at most the cap after reopening 300 from yesterday and finishing 21 hard ones', () => {
    // The architect's case: a hard done is worth 30; the database writes min(30, room) each time.
    const events = [ev('occurrence_reverted', -300, 'A')];
    let written = 0;
    for (let i = 0; i < 21; i++) {
      const amount = Math.min(30, capRoom(events, CAP));
      if (amount > 0) events.push(ev('occurrence_done', amount));
      written += amount;
    }
    expect(written).toBe(CAP);
    expect(capRoom(events, CAP)).toBe(0);
  });

  it('does not charge today for redoing what was undone today from another day', () => {
    // A was +300 yesterday, reopened and done again today: A nets zero, the room stays whole.
    const events = [ev('occurrence_reverted', -300, 'A'), ev('occurrence_done', 300, 'A')];
    expect(capRoom(events, CAP)).toBe(CAP);
  });

  it('charges private XP reopened and redone in a group (SEG6-3)', () => {
    // A was +30 private before the window; reopened (-30, private) and redone in group G (+30).
    const events = [ev('occurrence_reverted', -30, 'A'), ev('occurrence_done', 30, 'A', 'G')];
    expect(capRoom(events, CAP)).toBe(270);
  });

  it('sums the proof bonus with its occurrence', () => {
    const events = [ev('occurrence_done', 20, 'A'), ev('proof_bonus', 5, 'A')];
    expect(capRoom(events, CAP)).toBe(275);
    expect(capRoom([...events, ev('occurrence_reverted', -25, 'A')], CAP)).toBe(CAP);
  });

  it('counts every capped reason and only those', () => {
    for (const reason of xpEventReasonSchema.options) {
      const counted = (cappedXpEventReasons as readonly string[]).includes(reason);
      expect(capRoom([ev(reason, 10)], CAP)).toBe(counted ? 290 : 300);
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
    const events: Parameters<typeof capRoom>[0][number][] = [];
    for (let i = 0; i < 40; i += 1) {
      const occ = (reason: XpEventReason, amount: number) =>
        events.push({
          id: `${events.length}`,
          occurrenceId: `occ-${i}`,
          groupId: null,
          reason,
          amount,
        });
      const granted = applyCap({ base: 30, proofBonus: 5 }, capRoom(events, CAP));
      if (granted.base) occ('occurrence_done', granted.base);
      if (granted.proofBonus) occ('proof_bonus', granted.proofBonus);
    }
    expect(events.reduce((sum, { amount }) => sum + amount, 0)).toBe(CAP);
  });
});
