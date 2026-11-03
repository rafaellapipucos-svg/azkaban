import type { OccurrenceListItem } from '@azkaban/contracts';
import { describe, expect, it } from 'vitest';
import { buildDays } from './calendarDay';
import { earnedXp, groupByContext, localDayRange, planArea, planToday, todayGoal } from './today';
import type { XpRules } from './xp';

const SP = 'America/Sao_Paulo';
// Wednesday 2026-11-04 10:00 in Sao Paulo
const now = new Date('2026-11-04T13:00:00.000Z');

const item = (
  id: string,
  overrides: Partial<OccurrenceListItem> = {},
  task = {},
): OccurrenceListItem => ({
  id,
  taskId: `task-${id}`,
  assigneeId: 'me',
  scheduledStart: '2026-11-04T15:00:00.000Z',
  scheduledDue: '2026-11-04T15:00:00.000Z',
  overdueAt: '2026-11-05T03:00:00.000Z',
  status: 'pending',
  late: false,
  statusReason: null,
  statusChangedAt: null,
  statusChangedBy: null,
  proofReviewStatus: null,
  areaId: 'area',
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

const rules: XpRules = {
  status: { done: 10, done_late: 5, partial: 3, missed: 0 },
  difficultyWeight: { easy: 1, medium: 2, hard: 3 },
};
const late = { lateCompletionWindowHours: 72, canManageGroup: () => false };
const plan = (items: OccurrenceListItem[]) =>
  planToday(items, { now, timezone: SP, dueSoonDays: 7, ...late });

describe('localDayRange', () => {
  it('spans the local day, not the UTC day', () => {
    // 23:30 in Sao Paulo is already the next day in UTC.
    const late = new Date('2026-11-05T02:30:00.000Z');
    expect(localDayRange(SP, late)).toEqual({
      date: '2026-11-04',
      from: '2026-11-04T03:00:00.000Z',
      to: '2026-11-05T03:00:00.000Z',
    });
  });

  it('covers several days', () => {
    expect(localDayRange(SP, now, 3).to).toBe('2026-11-07T03:00:00.000Z');
  });
});

describe('planToday', () => {
  it('puts the day in time order', () => {
    const result = plan([
      item('b', { scheduledStart: '2026-11-04T20:00:00.000Z' }),
      item('a', { status: 'done' }),
    ]);
    expect(result.today.map(({ id }) => id)).toEqual(['a', 'b']);
  });

  it('keeps the order it was given for items that start together, whatever their status', () => {
    // The database orders ties by task creation and id; changing a status must not move a row.
    const order = (statusOfA: OccurrenceListItem['status']) =>
      plan([item('c'), item('a', { status: statusOfA }), item('d'), item('b')]).today.map(
        ({ id }) => id,
      );
    expect(order('pending')).toEqual(['c', 'a', 'd', 'b']);
    expect(order('done')).toEqual(['c', 'a', 'd', 'b']);
  });

  it('separates pending items past their overdueAt', () => {
    const result = plan([
      item('old', {
        scheduledStart: '2026-11-02T15:00:00.000Z',
        overdueAt: '2026-11-03T03:00:00.000Z',
      }),
      item('resolved-old', {
        status: 'done',
        scheduledStart: '2026-11-02T15:00:00.000Z',
        overdueAt: '2026-11-03T03:00:00.000Z',
      }),
    ]);
    expect(result.overdue.map(({ id }) => id)).toEqual(['old']);
    expect(result.today).toEqual([]);
  });

  it('drops cancelled items and repeated ids', () => {
    const result = plan([item('x', { status: 'cancelled' }), item('y'), item('y')]);
    expect(result.today.map(({ id }) => id)).toEqual(['y']);
  });

  it('uses the local day: 22:00 in Sao Paulo is still today', () => {
    const result = plan([item('night', { scheduledStart: '2026-11-05T01:00:00.000Z' })]);
    expect(result.today.map(({ id }) => id)).toEqual(['night']);
  });

  it('ignores tomorrow and later for timed tasks', () => {
    const result = plan([item('next', { scheduledStart: '2026-11-05T15:00:00.000Z' })]);
    expect(result.today).toEqual([]);
    expect(result.soon).toEqual([]);
  });

  it('shows a deadline on the day it falls due, not on the day it started', () => {
    const started = item(
      'long',
      {
        scheduledStart: '2026-11-02T03:00:00.000Z',
        scheduledDue: '2026-11-07T02:59:00.000Z',
        overdueAt: '2026-11-07T02:59:00.000Z',
      },
      { scheduleType: 'deadline' },
    );
    const result = plan([started]);
    expect(result.today).toEqual([]);
    expect(result.soon.map(({ id }) => id)).toEqual(['long']);
    expect(plan([{ ...started, scheduledDue: '2026-11-06T02:59:00.000Z' }]).soon).toHaveLength(1);
  });

  it('keeps far deadlines out until the window reaches them', () => {
    const far = item(
      'far',
      { scheduledDue: '2026-11-20T02:59:00.000Z', overdueAt: '2026-11-20T02:59:00.000Z' },
      { scheduleType: 'deadline' },
    );
    expect(plan([far]).soon).toEqual([]);
    expect(
      planToday([far], { now, timezone: SP, dueSoonDays: 30, ...late }).soon.map(({ id }) => id),
    ).toEqual(['far']);
  });

  it('shows a deadline due today in the day list', () => {
    const due = item(
      'due',
      { scheduledDue: '2026-11-05T02:59:00.000Z', overdueAt: '2026-11-05T02:59:00.000Z' },
      { scheduleType: 'deadline' },
    );
    expect(plan([due]).today.map(({ id }) => id)).toEqual(['due']);
  });

  it('does not list a resolved deadline as coming soon', () => {
    const done = item(
      'done',
      {
        status: 'done',
        scheduledDue: '2026-11-07T02:59:00.000Z',
        overdueAt: '2026-11-07T02:59:00.000Z',
      },
      { scheduleType: 'deadline' },
    );
    expect(plan([done]).soon).toEqual([]);
  });
});

describe('planArea', () => {
  it('lists overdue first, then days in order, skipping past days and cancelled items', () => {
    const result = planArea(
      [
        item('later', { scheduledStart: '2026-11-06T15:00:00.000Z' }),
        item('now'),
        item('old', {
          scheduledStart: '2026-11-02T15:00:00.000Z',
          overdueAt: '2026-11-03T03:00:00.000Z',
        }),
        item('old-done', {
          status: 'done',
          scheduledStart: '2026-11-02T15:00:00.000Z',
          overdueAt: '2026-11-03T03:00:00.000Z',
        }),
        item('gone', { status: 'cancelled' }),
        item('later-early', { scheduledStart: '2026-11-06T12:00:00.000Z' }),
      ],
      { now, timezone: SP, ...late },
    );
    expect(result.overdue.map(({ id }) => id)).toEqual(['old']);
    expect(result.days.map(({ date, items }) => [date, items.map(({ id }) => id)])).toEqual([
      ['2026-11-04', ['now']],
      ['2026-11-06', ['later-early', 'later']],
    ]);
  });

  it('puts a deadline on the day it falls due', () => {
    const due = item(
      'due',
      {
        scheduledStart: '2026-11-02T03:00:00.000Z',
        scheduledDue: '2026-11-08T02:59:00.000Z',
        overdueAt: '2026-11-08T02:59:00.000Z',
      },
      { scheduleType: 'deadline' },
    );
    expect(planArea([due], { now, timezone: SP, ...late }).days.map(({ date }) => date)).toEqual([
      '2026-11-07',
    ]);
  });
});

describe('groupByContext', () => {
  it('groups by context in order of first appearance', () => {
    const groups = groupByContext([
      item('1', {}, { contextId: 'b' }),
      item('2', {}, { contextId: 'a' }),
      item('3', {}, { contextId: 'b' }),
    ]);
    expect(groups.map(({ contextId, items }) => [contextId, items.map(({ id }) => id)])).toEqual([
      ['b', ['1', '3']],
      ['a', ['2']],
    ]);
  });
});

describe('earnedXp', () => {
  it('adds what the user resolved, weighted by difficulty, and ignores others', () => {
    const items = [
      item('a', { status: 'done' }, { difficulty: 'medium' }),
      item('b', { status: 'done', late: true }),
      item('c', { status: 'partial' }),
      item('d'),
      item('e', { status: 'done', assigneeId: 'other' }),
    ];
    expect(earnedXp(items, 'me', rules)).toBe(20 + 5 + 3);
  });

  it('holds back a done that waits for an admin, and counts it once approved', () => {
    const waiting = item('w', { status: 'done', proofReviewStatus: 'in_review' });
    expect(earnedXp([waiting], 'me', rules)).toBe(0);
    expect(earnedXp([{ ...waiting, proofReviewStatus: 'approved' }], 'me', rules)).toBe(10);
  });
});

describe('todayGoal, the ring of Hoje (ADR-0010 section 10)', () => {
  const goal = { percent: 80, countPartial: true };
  const ring = (items: OccurrenceListItem[], at = now) =>
    todayGoal(items, { now: at, timezone: SP, assigneeId: 'me', rules: goal });
  // Due today at 09:00 in Sao Paulo, an hour before `now`, and still pending.
  const passed = item(
    'passed',
    {
      scheduledStart: '2026-11-04T11:00:00.000Z',
      scheduledDue: '2026-11-04T12:00:00.000Z',
      overdueAt: '2026-11-04T12:00:00.000Z',
    },
    { scheduleType: 'deadline' },
  );

  it('keeps a deadline that passed this morning as not done', () => {
    const items = [passed, item('a', { status: 'done' })];
    expect(plan(items).overdue.map(({ id }) => id)).toEqual(['passed']);
    expect(ring(items)).toEqual({ planned: 2, completed: 1, needed: 2, met: false, progress: 0.5 });
  });

  it('does not get better by itself as the day goes on', () => {
    const items = [passed, item('a', { status: 'done' })];
    expect(ring(items, new Date('2026-11-05T02:00:00.000Z'))).toEqual(ring(items));
  });

  it('counts only the occurrences of the user, on the local day of the profile', () => {
    const items = [
      item('mine', { status: 'done' }),
      item('theirs', { assigneeId: 'other' }),
      // 23:00 of the 4th in Sao Paulo, already the 5th in UTC
      item('late-night', { scheduledStart: '2026-11-05T02:00:00.000Z' }),
      item('tomorrow', { scheduledStart: '2026-11-05T04:00:00.000Z' }),
      item('cancelled', { status: 'cancelled' }),
    ];
    expect(ring(items)).toMatchObject({ planned: 2, completed: 1 });
  });

  it('is full once the goal is met, the yellow and a done waiting for an admin counting', () => {
    const items = [
      item('a', { status: 'done' }),
      item('b', { status: 'done', proofReviewStatus: 'in_review' }),
      item('c', { status: 'done' }),
      item('d', { status: 'partial' }),
      item('e'),
    ];
    expect(ring(items)).toEqual({ planned: 5, completed: 4, needed: 4, met: true, progress: 1 });
  });

  it('is empty and not met with nothing planned', () => {
    expect(ring([])).toEqual({ planned: 0, completed: 0, needed: 0, met: false, progress: 0 });
  });
});

describe('an overdue occurrence that was moved to another day (ADR-0005 section 11)', () => {
  // Rescheduled to tomorrow, still overdue: the database keeps overdueAt, and both queries of the
  // lists return it (the window by the new day, the overdue one by overdueAt).
  const moved = item('moved', {
    scheduledStart: '2026-11-05T15:00:00.000Z',
    scheduledDue: '2026-11-05T15:00:00.000Z',
    overdueAt: '2026-11-03T03:00:00.000Z',
  });
  // Rescheduled to later today.
  const movedToday = item('moved-today', {
    scheduledStart: '2026-11-04T20:00:00.000Z',
    scheduledDue: '2026-11-04T20:00:00.000Z',
    overdueAt: '2026-11-03T03:00:00.000Z',
  });

  it('shows once in Hoje, among the overdue, even when both queries return it', () => {
    const result = plan([moved, movedToday, moved, movedToday]);
    expect(result.overdue.map(({ id }) => id)).toEqual(['moved-today', 'moved']);
    expect(result.today).toEqual([]);
    expect(result.soon).toEqual([]);
  });

  it('shows once in the area tab, among the overdue and not again on its new day', () => {
    const result = planArea([moved, movedToday, moved, movedToday], { now, timezone: SP, ...late });
    expect(result.overdue.map(({ id }) => id)).toEqual(['moved-today', 'moved']);
    expect(result.days).toEqual([]);
  });

  it('shows on its new day in the calendar', () => {
    const days = buildDays([moved, moved], { timezone: SP });
    expect(days.get('2026-11-05')?.items.map(({ id }) => id)).toEqual(['moved']);
    expect(days.size).toBe(1);
  });
});

describe('a red one the job left inside the late window (QA4-1, ADR-0005 section 1)', () => {
  // Yesterday's task, red since the end of yesterday; the 72 hours end on 2026-11-07 03:00Z.
  const overdueAt = '2026-11-04T03:00:00.000Z';
  const end = Date.parse('2026-11-07T03:00:00.000Z');
  const red = item('red', {
    status: 'missed',
    scheduledStart: '2026-11-03T15:00:00.000Z',
    scheduledDue: '2026-11-03T15:00:00.000Z',
    overdueAt,
  });
  const at = (ms: number, canManageGroup = false) => ({
    now: new Date(ms),
    timezone: SP,
    dueSoonDays: 7,
    lateCompletionWindowHours: 72,
    canManageGroup: () => canManageGroup,
  });
  const ids = (list: OccurrenceListItem[]) => list.map(({ id }) => id);

  it.each([
    ['at overdueAt, still on time', Date.parse(overdueAt), []],
    ['just after overdueAt', Date.parse(overdueAt) + 1, ['red']],
    ['at the last instant of the window', end, ['red']],
    ['one millisecond after the window', end + 1, []],
  ])('%s', (_, ms, want) => {
    expect(ids(planToday([red], at(ms)).overdue)).toEqual(want);
    expect(ids(planArea([red], at(ms)).overdue)).toEqual(want);
  });

  it('leaves both lists once the window closes', () => {
    expect(planToday([red], at(end + 1))).toMatchObject({ today: [], soon: [] });
    expect(planArea([red], at(end + 1)).days).toEqual([]);
  });

  it('has no window for whoever manages the group of the task', () => {
    const groupRed = { ...red, task: { ...red.task, groupId: 'g' } };
    const manages = { ...at(end + 1), canManageGroup: (groupId: string | null) => groupId === 'g' };
    expect(ids(planToday([groupRed], manages).overdue)).toEqual(['red']);
    expect(ids(planArea([groupRed], manages).overdue)).toEqual(['red']);
    expect(ids(planToday([red], manages).overdue)).toEqual([]);
    expect(ids(planToday([groupRed], at(end + 1, false)).overdue)).toEqual([]);
  });

  it('stays on its day when it went red before overdueAt', () => {
    const early = item('early', { status: 'missed' });
    expect(planToday([early], at(now.getTime()))).toMatchObject({ overdue: [], today: [early] });
  });
});
