import { occurrenceStatusSchema, taskDifficultySchema } from '@azkaban/contracts';
import { describe, expect, it } from 'vitest';
import { occurrenceXp, type XpRules } from './xp';

// Same numbers as taskRules.xp. Not imported: core does not depend on config.
const rules: XpRules = {
  status: { done: 10, done_late: 5, partial: 3, missed: 0 },
  difficultyWeight: { easy: 1, medium: 2, hard: 3 },
};

describe('occurrenceXp (ADR-0005 section 6)', () => {
  it.each([
    ['done', false, 'easy', 10],
    ['done', false, 'medium', 20],
    ['done', false, 'hard', 30],
    ['done', true, 'easy', 5],
    ['done', true, 'medium', 10],
    ['done', true, 'hard', 15],
    ['partial', false, 'easy', 3],
    ['partial', false, 'medium', 6],
    ['partial', false, 'hard', 9],
    // A late partial keeps the partial value: only the green is reduced (section 7.11).
    ['partial', true, 'easy', 3],
    ['partial', true, 'hard', 9],
    // Zero is a value, not an absence.
    ['missed', false, 'hard', 0],
    ['missed', true, 'easy', 0],
    ['pending', false, 'hard', 0],
    ['cancelled', false, 'hard', 0],
  ] as const)('%s late=%s %s -> %i', (status, late, difficulty, want) => {
    expect(occurrenceXp({ status, late, difficulty }, rules)).toBe(want);
  });

  it('is never negative and never -0', () => {
    for (const status of occurrenceStatusSchema.options) {
      for (const difficulty of taskDifficultySchema.options) {
        for (const late of [true, false]) {
          const xp = occurrenceXp({ status, late, difficulty }, rules);
          expect(xp).toBeGreaterThanOrEqual(0);
          expect(Object.is(xp, -0)).toBe(false);
        }
      }
    }
  });

  it('follows the rules it is given', () => {
    const doubled: XpRules = {
      status: { done: 20, done_late: 10, partial: 6, missed: 1 },
      difficultyWeight: { easy: 1, medium: 2, hard: 3 },
    };
    expect(occurrenceXp({ status: 'done', late: false, difficulty: 'easy' }, doubled)).toBe(20);
    expect(occurrenceXp({ status: 'missed', late: false, difficulty: 'hard' }, doubled)).toBe(3);
  });

  it('gives zero for every status when the rules say zero', () => {
    const none: XpRules = {
      status: { done: 0, done_late: 0, partial: 0, missed: 0 },
      difficultyWeight: { easy: 1, medium: 2, hard: 3 },
    };
    for (const status of occurrenceStatusSchema.options) {
      expect(occurrenceXp({ status, late: false, difficulty: 'hard' }, none)).toBe(0);
    }
  });
});
