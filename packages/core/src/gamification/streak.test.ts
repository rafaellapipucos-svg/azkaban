import type { OccurrenceListItem } from '@azkaban/contracts';
import { describe, expect, it } from 'vitest';
import { addDays } from '../tasks/form';
import {
  dailyGoal,
  dayCounts,
  foldStreak,
  recentDays,
  type GoalRules,
  type StreakDay,
  type StreakRules,
} from './streak';

// Same numbers as gamificationRules in config, which core does not import.
const goal: GoalRules = { percent: 80, countPartial: true };
const streak: StreakRules = { emptyDayKeepsStreak: true, freezeEveryDays: 7, maxFreezes: 2 };
const rules = { goal, streak };

describe('dailyGoal (ADR-0010 section 3)', () => {
  it('meets 4 of 5 (400 ≥ 400)', () => {
    expect(dailyGoal({ planned: 5, done: 4, partial: 0 }, goal)).toEqual({
      planned: 5,
      completed: 4,
      needed: 4,
      met: true,
      progress: 1,
    });
  });

  it('counts the yellow: 3 done and 1 partial of 5', () => {
    expect(dailyGoal({ planned: 5, done: 3, partial: 1 }, goal).met).toBe(true);
    const strict = dailyGoal({ planned: 5, done: 3, partial: 1 }, { ...goal, countPartial: false });
    expect(strict).toMatchObject({ completed: 3, met: false });
  });

  it('does not meet 2 of 3 (200 < 240), which needs 3', () => {
    expect(dailyGoal({ planned: 3, done: 2, partial: 0 }, goal)).toEqual({
      planned: 3,
      completed: 2,
      needed: 3,
      met: false,
      progress: 2 / 3,
    });
  });

  it('does not meet a day with nothing planned', () => {
    expect(dailyGoal({ planned: 0, done: 0, partial: 0 }, goal)).toEqual({
      planned: 0,
      completed: 0,
      needed: 0,
      met: false,
      progress: 0,
    });
    expect(dailyGoal({ planned: 0, done: 0, partial: 0 }, { ...goal, percent: 0 }).met).toBe(false);
  });

  it('meets exactly at the edge, never a step before', () => {
    // 10 × 80 = 800: 8 meets, 7 does not.
    expect(dailyGoal({ planned: 10, done: 8, partial: 0 }, goal).met).toBe(true);
    expect(dailyGoal({ planned: 10, done: 7, partial: 0 }, goal).met).toBe(false);
  });

  it('agrees with needed for every count, so the ring and the streak never disagree', () => {
    for (const percent of [0, 1, 50, 80, 99, 100]) {
      for (let planned = 0; planned <= 30; planned += 1) {
        for (let done = 0; done <= planned; done += 1) {
          const result = dailyGoal({ planned, done, partial: 0 }, { ...goal, percent });
          expect(result.needed).toBe(Math.ceil((planned * percent) / 100));
          expect(result.met).toBe(planned > 0 && done >= result.needed);
          expect(result.progress).toBeGreaterThanOrEqual(0);
          expect(result.progress).toBeLessThanOrEqual(1);
        }
      }
    }
  });
});

const SP = 'America/Sao_Paulo';
const NY = 'America/New_York';

const item = (
  id: string,
  overrides: Partial<OccurrenceListItem> = {},
  task: Partial<OccurrenceListItem['task']> = {},
): OccurrenceListItem => ({
  id,
  taskId: `task-${id}`,
  assigneeId: 'me',
  // 12:00 on 2026-11-04 in Sao Paulo
  scheduledStart: '2026-11-04T15:00:00.000Z',
  scheduledDue: '2026-11-04T15:00:00.000Z',
  overdueAt: '2026-11-05T03:00:00.000Z',
  status: 'pending',
  late: false,
  statusReason: null,
  statusChangedAt: null,
  statusChangedBy: null,
  proofReviewStatus: null,
  areaId: 'area-a',
  task: {
    title: id,
    contextId: 'ctx-a',
    groupId: null,
    createdBy: 'me',
    assigneeId: 'me',
    scheduleType: 'timed',
    timezone: SP,
    priority: 'normal',
    difficulty: 'easy',
    visibility: 'private',
    rrule: null,
    requiresPartialReason: true,
    requiresPhotoProof: false,
    requiresAdminApproval: false,
    proofFlagsLocked: false,
    ...task,
  },
  ...overrides,
});

describe('dayCounts', () => {
  const counts = (items: OccurrenceListItem[], timezone = SP, date = '2026-11-04') =>
    dayCounts(items, { timezone, date, assigneeId: 'me' });

  it('counts in_review as done, drops cancelled, repeats and other assignees', () => {
    const items = [
      item('a', { status: 'done' }),
      item('b', { status: 'done', proofReviewStatus: 'in_review' }),
      item('c', { status: 'partial' }),
      item('d', { status: 'missed' }),
      item('e'),
      item('f', { status: 'cancelled' }),
      item('a', { status: 'done' }),
      item('g', { status: 'done', assigneeId: 'someone-else' }),
    ];
    expect(counts(items)).toEqual({ planned: 5, done: 2, partial: 1, missed: 1, perfect: false });
  });

  it('is perfect only when every planned one is done', () => {
    expect(counts([item('a', { status: 'done' }), item('b', { status: 'done' })]).perfect).toBe(
      true,
    );
    expect(counts([]).perfect).toBe(false);
  });

  it('uses the zone of the profile, not the zone of the task', () => {
    // 02:30Z on the 5th is 23:30 of the 4th in Sao Paulo, and the 5th in UTC.
    const late = item(
      'a',
      { scheduledStart: '2026-11-05T02:30:00.000Z', scheduledDue: '2026-11-05T02:30:00.000Z' },
      { timezone: 'UTC' },
    );
    expect(counts([late]).planned).toBe(1);
    expect(counts([late], 'UTC').planned).toBe(0);
    expect(counts([late], 'UTC', '2026-11-05').planned).toBe(1);
  });

  it('puts a deadline on the day it falls due', () => {
    const deadline = item(
      'a',
      { scheduledStart: '2026-11-01T15:00:00.000Z', scheduledDue: '2026-11-04T15:00:00.000Z' },
      { scheduleType: 'deadline' },
    );
    expect(counts([deadline]).planned).toBe(1);
    expect(counts([deadline], SP, '2026-11-01').planned).toBe(0);
  });

  it('keeps the whole 25-hour day when daylight saving ends', () => {
    // New York leaves EDT at 06:00Z on 2026-11-01. 04:30Z is 00:30 EDT, and 04:30Z on the 2nd is
    // 23:30 EST: both on the 1st, a day of 25 hours.
    const start = item('a', {
      scheduledStart: '2026-11-01T04:30:00.000Z',
      scheduledDue: '2026-11-01T04:30:00.000Z',
    });
    const end = item('b', {
      scheduledStart: '2026-11-02T04:30:00.000Z',
      scheduledDue: '2026-11-02T04:30:00.000Z',
    });
    expect(counts([start, end], NY, '2026-11-01').planned).toBe(2);
    expect(counts([start, end], NY, '2026-11-02').planned).toBe(0);
  });

  it('feeds dailyGoal directly', () => {
    const items = ['a', 'b', 'c', 'd'].map((id) => item(id, { status: 'done' }));
    expect(dailyGoal(counts([...items, item('e')]), goal).met).toBe(true);
  });
});

// The table of canonical cases of ADR-0010 section 3, shared with pgTAP. F closed with the goal,
// x closed without it, 0 closed and empty, P closed and perfect, h+ today with the goal, h- today
// without it.
const counts = {
  F: { planned: 5, done: 4, partial: 0 },
  x: { planned: 5, done: 1, partial: 1 },
  '0': { planned: 0, done: 0, partial: 0 },
  P: { planned: 3, done: 3, partial: 0 },
  'h+': { planned: 5, done: 3, partial: 1 },
  'h-': { planned: 5, done: 3, partial: 0 },
} as const;

const START = '2026-10-01';

function fold(spec: string, streakRules: StreakRules = streak) {
  const tokens = spec.split(' ').flatMap((token) => {
    const [kind, times] = token.split('×');
    return Array<string>(Number(times ?? 1)).fill(kind!);
  }) as (keyof typeof counts)[];
  const days: StreakDay[] = tokens.map((token, i) => ({
    localDate: addDays(START, i),
    ...counts[token],
  }));
  const last = tokens.at(-1)!;
  const today = addDays(START, last.startsWith('h') ? tokens.length - 1 : tokens.length);
  return foldStreak(days, { today, rules: { goal, streak: streakRules } });
}

describe('foldStreak: canonical cases (ADR-0010 section 3)', () => {
  it.each([
    ['F F F', 3, 0, 0],
    ['F 0 F', 2, 0, 0],
    ['F F x F', 1, 0, 0],
    ['F×7', 7, 1, 0],
    ['F×7 x F', 8, 0, 0],
    ['F×21', 21, 2, 0],
    ['F F h-', 2, 0, 0],
    ['F F h+', 3, 0, 0],
    ['P 0 P', 2, 0, 2],
    ['P P F', 3, 0, 0],
  ])('%s -> streak %i, freezes %i, perfectRun %i', (spec, wantStreak, wantFreezes, wantRun) => {
    expect(fold(spec)).toMatchObject({
      streak: wantStreak,
      freezes: wantFreezes,
      perfectRun: wantRun,
    });
  });

  it('F 0, without emptyDayKeepsStreak -> 0, 0, 0', () => {
    expect(fold('F 0', { ...streak, emptyDayKeepsStreak: false })).toMatchObject({
      streak: 0,
      freezes: 0,
      perfectRun: 0,
    });
  });

  it('F×7 x F: the x writes freezeUsed and keeps the streak', () => {
    const { days, best } = fold('F×7 x F');
    expect(days[7]).toMatchObject({ goalMet: false, freezeUsed: true, streak: 7, freezes: 0 });
    expect(days.filter((day) => day.freezeUsed)).toHaveLength(1);
    expect(best).toBe(8);
  });
});

describe('foldStreak: freezes at the limit', () => {
  it('spends the only freeze, then breaks on the next miss', () => {
    expect(fold('F×7 x x')).toMatchObject({ streak: 0, freezes: 0, best: 7 });
  });

  it('spends two freezes in a row and keeps going', () => {
    expect(fold('F×14 x x F')).toMatchObject({ streak: 15, freezes: 0 });
    expect(fold('F×14 x x x')).toMatchObject({ streak: 0, freezes: 0, best: 14 });
  });

  it('earns a freeze again at the next multiple', () => {
    // 7 earns, the x spends it, 14 earns again.
    expect(fold('F×7 x F×7')).toMatchObject({ streak: 14, freezes: 1 });
  });

  it('stops at maxFreezes', () => {
    expect(fold('F×28')).toMatchObject({ streak: 28, freezes: 2 });
    expect(fold('F×6')).toMatchObject({ streak: 6, freezes: 0 });
  });

  it('is unbroken by a missed day while today is still open', () => {
    expect(fold('F F x h-')).toMatchObject({ streak: 0 });
    expect(fold('F F h-').days.at(-1)).toMatchObject({ freezeUsed: false, streak: 2 });
  });
});

describe('foldStreak: empty and missing days', () => {
  it('treats a day with no row as empty', () => {
    const days: StreakDay[] = [
      { localDate: '2026-10-01', ...counts.F },
      { localDate: '2026-10-03', ...counts.F },
    ];
    expect(foldStreak(days, { today: '2026-10-04', rules }).streak).toBe(2);
    const strict = { goal, streak: { ...streak, emptyDayKeepsStreak: false } };
    expect(foldStreak(days, { today: '2026-10-04', rules: strict }).streak).toBe(1);
    // Only the given days are written back.
    expect(foldStreak(days, { today: '2026-10-04', rules }).days).toHaveLength(2);
  });

  it('without the option, a closed empty day breaks but keeps the perfect run', () => {
    expect(fold('P 0 P', { ...streak, emptyDayKeepsStreak: false })).toMatchObject({
      streak: 1,
      perfectRun: 2,
    });
  });

  it('without the option, an empty today breaks nothing', () => {
    expect(
      foldStreak(
        [
          { localDate: '2026-10-01', ...counts.F },
          { localDate: '2026-10-02', ...counts['0'] },
        ],
        { today: '2026-10-02', rules: { goal, streak: { ...streak, emptyDayKeepsStreak: false } } },
      ).streak,
    ).toBe(1);
  });

  it('leaves out days after today', () => {
    const days: StreakDay[] = [
      { localDate: '2026-10-01', ...counts.F },
      { localDate: '2026-10-03', ...counts.F },
    ];
    expect(foldStreak(days, { today: '2026-10-02', rules })).toMatchObject({ streak: 1 });
  });

  it('starts at zero with no days', () => {
    expect(foldStreak([], { today: '2026-10-02', rules })).toEqual({
      streak: 0,
      best: 0,
      freezes: 0,
      perfectRun: 0,
      days: [],
    });
  });

  it('walks local dates through daylight saving changes without skipping or repeating one', () => {
    const strict = { goal, streak: { ...streak, emptyDayKeepsStreak: false } };
    const around = (dates: string[]) =>
      foldStreak(
        dates.map((localDate) => ({ localDate, ...counts.F })),
        { today: addDays(dates.at(-1)!, 1), rules: strict },
      ).streak;
    expect(around(['2026-03-07', '2026-03-08', '2026-03-09'])).toBe(3);
    expect(around(['2026-10-31', '2026-11-01', '2026-11-02'])).toBe(3);
    expect(around(['2026-02-28', '2026-03-01'])).toBe(2);
  });
});

describe('recentDays (QA6-5)', () => {
  it('lists the last days, today first', () => {
    expect(recentDays('2026-11-03', '2026-01-01', 3)).toEqual([
      '2026-11-03',
      '2026-11-02',
      '2026-11-01',
    ]);
  });

  it('starts on the day the profile was created', () => {
    expect(recentDays('2026-11-03', '2026-11-02', 7)).toEqual(['2026-11-03', '2026-11-02']);
    expect(recentDays('2026-11-03', '2026-11-03', 7)).toEqual(['2026-11-03']);
  });

  it('keeps today when the creation day is after it', () => {
    expect(recentDays('2026-11-03', '2026-11-04', 7)).toEqual(['2026-11-03']);
  });
});
