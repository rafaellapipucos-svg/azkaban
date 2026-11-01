import type { OccurrenceListItem } from '@azkaban/contracts';
import { describe, expect, it } from 'vitest';
import { earnedXp, groupByContext, localDayRange, planToday } from './today';
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
    ...task,
  },
  ...overrides,
});

const rules: XpRules = {
  status: { done: 10, done_late: 5, partial: 3, missed: 0 },
  difficultyWeight: { easy: 1, medium: 2, hard: 3 },
};
const plan = (items: OccurrenceListItem[]) =>
  planToday(items, { now, timezone: SP, dueSoonDays: 7 });

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
  it('puts the day in time order and counts the goal', () => {
    const result = plan([
      item('b', { scheduledStart: '2026-11-04T20:00:00.000Z' }),
      item('a', { status: 'done' }),
    ]);
    expect(result.today.map(({ id }) => id)).toEqual(['a', 'b']);
    expect(result.goal).toEqual({ done: 1, total: 2 });
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
      planToday([far], { now, timezone: SP, dueSoonDays: 30 }).soon.map(({ id }) => id),
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
});
