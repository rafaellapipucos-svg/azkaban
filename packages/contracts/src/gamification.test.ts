import { describe, expect, it } from 'vitest';
import { achievementSchema, groupRankingRowSchema, userDayStatsSchema } from './gamification';
import { groupSettingsSchema } from './groups';
import { cappedXpEventReasons, xpEventReasonSchema, xpEventSchema } from './tasks';

const id = '11111111-1111-4111-8111-111111111111';

describe('xpEventSchema', () => {
  const event = {
    id,
    userId: id,
    groupId: null,
    occurrenceId: id,
    localDate: null,
    amount: 10,
    reason: 'occurrence_done',
    createdAt: '2026-11-03T12:00:00+00:00',
  };

  it('ties the local day to the perfect day and to nothing else', () => {
    expect(xpEventSchema.safeParse(event).success).toBe(true);
    const day = { ...event, occurrenceId: null, localDate: '2026-11-03' };
    expect(xpEventSchema.safeParse({ ...day, reason: 'perfect_day' }).success).toBe(true);
    expect(
      xpEventSchema.safeParse({ ...day, reason: 'perfect_day_reverted', amount: -20 }).success,
    ).toBe(true);
    expect(xpEventSchema.safeParse({ ...event, reason: 'perfect_day' }).success).toBe(false);
    expect(xpEventSchema.safeParse({ ...event, localDate: '2026-11-03' }).success).toBe(false);
  });

  it('refuses an event worth zero, as the database does', () => {
    expect(xpEventSchema.safeParse({ ...event, amount: 0 }).success).toBe(false);
  });

  it('reserves the shopping reason for Phase 7', () => {
    expect(xpEventReasonSchema.safeParse('shopping_completed').success).toBe(true);
  });
});

describe('cappedXpEventReasons', () => {
  it('leaves only the perfect day out of the daily cap', () => {
    const outside = xpEventReasonSchema.options.filter(
      (reason) => !(cappedXpEventReasons as readonly string[]).includes(reason),
    );
    expect(outside).toEqual(['perfect_day', 'perfect_day_reverted']);
  });
});

describe('groupSettingsSchema', () => {
  it('keeps keys it does not know, so a write does not drop them', () => {
    const parsed = groupSettingsSchema.parse({ rankingEnabled: false, other: 1 });
    expect(parsed).toEqual({ rankingEnabled: false, other: 1 });
  });

  it('takes the toggle absent, as the type default', () => {
    expect(groupSettingsSchema.safeParse({}).success).toBe(true);
  });

  it.each(['false', 0, null])('refuses %j as the toggle', (rankingEnabled) => {
    expect(groupSettingsSchema.safeParse({ rankingEnabled }).success).toBe(false);
  });
});

describe('groupRankingRowSchema', () => {
  it('never carries a member without XP that week', () => {
    const row = { userId: id, displayName: 'Ana', xp: 1, rank: 1 };
    expect(groupRankingRowSchema.safeParse(row).success).toBe(true);
    expect(groupRankingRowSchema.safeParse({ ...row, xp: 0 }).success).toBe(false);
  });
});

describe('achievementSchema', () => {
  const seed = { key: 'streak_7', kind: 'streak_days', threshold: 7, icon: '🔥', sortOrder: 2 };

  it('takes a seed row and refuses a key that is not an i18n key segment', () => {
    expect(achievementSchema.safeParse(seed).success).toBe(true);
    expect(achievementSchema.safeParse({ ...seed, key: 'streak.7' }).success).toBe(false);
    expect(achievementSchema.safeParse({ ...seed, threshold: 0 }).success).toBe(false);
  });
});

describe('userDayStatsSchema', () => {
  it('refuses negative counts', () => {
    const day = {
      userId: id,
      localDate: '2026-11-03',
      planned: 3,
      done: 3,
      partial: 0,
      missed: 0,
      goalMet: true,
      perfect: true,
      freezeUsed: false,
      streak: 4,
      freezes: 0,
      perfectRun: 2,
    };
    expect(userDayStatsSchema.safeParse(day).success).toBe(true);
    expect(userDayStatsSchema.safeParse({ ...day, streak: -1 }).success).toBe(false);
  });
});
