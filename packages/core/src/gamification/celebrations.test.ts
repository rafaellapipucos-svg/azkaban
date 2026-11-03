import type { AchievementKind } from '@azkaban/contracts';
import { describe, expect, it } from 'vitest';
import { celebrationsFor, reachedAchievements } from './celebrations';

// Same values as gamificationDefaults and the seed of ADR-0010 section 5.
const levelCurve = { firstLevelXp: 100, growth: 1.25 };
const streakMilestones = [7, 30, 100, 365];
const seed = [
  { key: 'first_task', kind: 'occurrences_done', threshold: 1 },
  { key: 'streak_7', kind: 'streak_days', threshold: 7 },
  { key: 'streak_30', kind: 'streak_days', threshold: 30 },
  { key: 'proofs_100', kind: 'proofs', threshold: 100 },
  { key: 'perfect_week', kind: 'perfect_run', threshold: 7 },
] as const;

const progress = (values: Partial<Record<AchievementKind, number>>) => ({
  occurrences_done: 0,
  streak_days: 0,
  proofs: 0,
  perfect_run: 0,
  ...values,
});

describe('reachedAchievements (ADR-0010 section 5)', () => {
  it('reaches nothing from zero', () => {
    expect(reachedAchievements(seed, progress({}))).toEqual([]);
  });

  it('reaches each kind exactly at its threshold', () => {
    expect(reachedAchievements(seed, progress({ occurrences_done: 1 }))).toEqual(['first_task']);
    expect(reachedAchievements(seed, progress({ streak_days: 6 }))).toEqual([]);
    expect(reachedAchievements(seed, progress({ streak_days: 7 }))).toEqual(['streak_7']);
    expect(reachedAchievements(seed, progress({ streak_days: 30 }))).toEqual([
      'streak_7',
      'streak_30',
    ]);
    expect(reachedAchievements(seed, progress({ proofs: 99 }))).toEqual([]);
    expect(reachedAchievements(seed, progress({ proofs: 100 }))).toEqual(['proofs_100']);
    expect(reachedAchievements(seed, progress({ perfect_run: 7 }))).toEqual(['perfect_week']);
  });
});

const stats = (totalXp: number, currentStreak = 0) => ({ totalXp, currentStreak });
const burst = (
  overrides: Partial<Parameters<typeof celebrationsFor>[2]> = {},
): Parameters<typeof celebrationsFor>[2] => ({
  events: [],
  achievementKeys: [],
  streakMilestones,
  celebratedLevel: 1,
  levelCurve,
  ...overrides,
});

describe('celebrationsFor (ADR-0010 section 8)', () => {
  it('celebrates a done and a partial from their events', () => {
    expect(
      celebrationsFor(
        stats(0),
        stats(10),
        burst({ events: [{ reason: 'occurrence_done', amount: 10 }] }),
      ).celebrations,
    ).toEqual([{ kind: 'occurrence_done' }]);
    expect(
      celebrationsFor(
        stats(0),
        stats(5),
        burst({ events: [{ reason: 'occurrence_done_late', amount: 5 }] }),
      ).celebrations,
    ).toEqual([{ kind: 'occurrence_done' }]);
    expect(
      celebrationsFor(
        stats(0),
        stats(3),
        burst({ events: [{ reason: 'occurrence_partial', amount: 3 }] }),
      ).celebrations,
    ).toEqual([{ kind: 'occurrence_partial' }]);
  });

  it('celebrates nothing for compensations and bonuses alone', () => {
    expect(
      celebrationsFor(
        stats(30),
        stats(0),
        burst({
          events: [
            { reason: 'occurrence_reverted', amount: -10 },
            { reason: 'perfect_day_reverted', amount: -20 },
          ],
        }),
      ).celebrations,
    ).toEqual([]);
    expect(
      celebrationsFor(stats(0), stats(5), burst({ events: [{ reason: 'proof_bonus', amount: 5 }] }))
        .celebrations,
    ).toEqual([]);
  });

  it('celebrates a streak milestone when it is crossed, and only the largest', () => {
    expect(celebrationsFor(stats(0, 6), stats(0, 7), burst()).celebrations).toEqual([
      { kind: 'streak_milestone', days: 7 },
    ]);
    expect(celebrationsFor(stats(0, 7), stats(0, 8), burst()).celebrations).toEqual([]);
    expect(celebrationsFor(stats(0, 0), stats(0, 30), burst()).celebrations).toEqual([
      { kind: 'streak_milestone', days: 30 },
    ]);
  });

  it('celebrates a level once per device', () => {
    const up = celebrationsFor(stats(90), stats(110), burst());
    expect(up).toEqual({ celebrations: [{ kind: 'level_up', level: 2 }], celebratedLevel: 2 });
    // Reopened and done again: back to level 2, already celebrated here.
    expect(celebrationsFor(stats(90), stats(110), burst({ celebratedLevel: 2 }))).toEqual({
      celebrations: [],
      celebratedLevel: 2,
    });
    // A new device learns the level without celebrating it.
    expect(celebrationsFor(stats(500), stats(510), burst({ celebratedLevel: 0 }))).toEqual({
      celebrations: [],
      celebratedLevel: 4,
    });
  });

  it('puts the largest first and lists the rest', () => {
    const { celebrations } = celebrationsFor(
      stats(90, 6),
      stats(130, 7),
      burst({
        events: [
          { reason: 'occurrence_done', amount: 20 },
          { reason: 'perfect_day', amount: 20 },
        ],
        achievementKeys: ['streak_7', 'perfect_week'],
      }),
    );
    expect(celebrations).toEqual([
      { kind: 'achievement', key: 'streak_7' },
      { kind: 'achievement', key: 'perfect_week' },
      { kind: 'level_up', level: 2 },
      { kind: 'perfect_day' },
      { kind: 'streak_milestone', days: 7 },
      { kind: 'occurrence_done' },
    ]);
  });
});
