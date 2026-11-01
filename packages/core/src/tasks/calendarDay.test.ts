import type { OccurrenceListItem } from '@azkaban/contracts';
import { describe, expect, it } from 'vitest';
import {
  buildDays,
  dayTimeline,
  emptyDay,
  isPerfectDay,
  noFilter,
  occurrenceDay,
  summarizeDay,
} from './calendarDay';

const SP = 'America/Sao_Paulo';

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
    ...task,
  },
  ...overrides,
});

const day = (items: OccurrenceListItem[], filter = noFilter) =>
  buildDays(items, { timezone: SP, filter }).get('2026-11-04');

describe('occurrenceDay', () => {
  it('uses the day in the zone of the user, at both edges', () => {
    // 02:59Z is 23:59 of the 3rd in Sao Paulo, 03:00Z is midnight of the 4th.
    expect(occurrenceDay(item('a', { scheduledStart: '2026-11-04T02:59:00.000Z' }), SP)).toBe(
      '2026-11-03',
    );
    expect(occurrenceDay(item('b', { scheduledStart: '2026-11-04T03:00:00.000Z' }), SP)).toBe(
      '2026-11-04',
    );
    // The same instant is already the 4th in UTC and Tokyo
    expect(occurrenceDay(item('a', { scheduledStart: '2026-11-04T02:59:00.000Z' }), 'UTC')).toBe(
      '2026-11-04',
    );
  });

  it('puts a deadline on the day it falls due', () => {
    const deadline = item(
      'd',
      { scheduledStart: '2026-11-01T15:00:00.000Z', scheduledDue: '2026-11-06T02:59:00.000Z' },
      { scheduleType: 'deadline' },
    );
    expect(occurrenceDay(deadline, SP)).toBe('2026-11-05');
  });
});

describe('perfect day', () => {
  it('needs every task green', () => {
    expect(isPerfectDay(summarizeDay([item('a', { status: 'done' })]))).toBe(true);
    expect(
      isPerfectDay(summarizeDay([item('a', { status: 'done' }), item('b', { status: 'done' })])),
    ).toBe(true);
  });

  it('is not perfect with a day without tasks', () => {
    expect(isPerfectDay(summarizeDay([]))).toBe(false);
    expect(emptyDay('2026-11-04').perfect).toBe(false);
  });

  it('is broken by pending, yellow and red', () => {
    for (const status of ['pending', 'partial', 'missed'] as const) {
      expect(day([item('a', { status: 'done' }), item('b', { status })])?.perfect).toBe(false);
    }
  });

  it('ignores cancelled occurrences', () => {
    expect(day([item('a', { status: 'done' }), item('b', { status: 'cancelled' })])?.perfect).toBe(
      true,
    );
    // Only cancelled ones: nothing planned, nothing to celebrate
    expect(day([item('b', { status: 'cancelled' })])).toBeUndefined();
  });

  it('counts a late done as green', () => {
    expect(day([item('a', { status: 'done', late: true })])?.perfect).toBe(true);
  });

  it('is decided by area and context, not by the status filter', () => {
    const items = [
      item('a', { status: 'done' }),
      item('b', { status: 'pending' }),
      item('c', { status: 'done', areaId: 'area-b' }, { contextId: 'ctx-b' }),
    ];
    // The status filter lists the green one, but the day still has a pending task
    const green = day(items, { ...noFilter, status: 'done' });
    expect(green?.items.map(({ id }) => id)).toEqual(['a', 'c']);
    expect(green?.perfect).toBe(false);
    // Narrowing to the other area leaves only green tasks
    expect(day(items, { ...noFilter, areaId: 'area-b' })?.perfect).toBe(true);
    expect(day(items, { ...noFilter, contextId: 'ctx-b' })?.items).toHaveLength(1);
  });
});

describe('buildDays', () => {
  it('counts statuses and keeps time order', () => {
    const info = day([
      item('late', { scheduledStart: '2026-11-04T20:00:00.000Z', status: 'missed' }),
      item('early', { scheduledStart: '2026-11-04T10:00:00.000Z', status: 'done' }),
      item('mid', { status: 'partial' }),
      item('mid2', { status: 'pending' }),
    ]);
    expect(info?.items.map(({ id }) => id)).toEqual(['early', 'mid', 'mid2', 'late']);
    expect(info?.summary).toEqual({ total: 4, pending: 1, done: 1, partial: 1, missed: 1 });
  });

  it('counts a repeated id once', () => {
    expect(day([item('a'), item('a')])?.summary.total).toBe(1);
  });

  it('assigns the edges of the day by the local zone', () => {
    const days = buildDays(
      [
        item('before', { scheduledStart: '2026-11-04T02:59:00.000Z' }),
        item('after', { scheduledStart: '2026-11-04T03:00:00.000Z' }),
      ],
      { timezone: SP },
    );
    expect(days.get('2026-11-03')?.items.map(({ id }) => id)).toEqual(['before']);
    expect(days.get('2026-11-04')?.items.map(({ id }) => id)).toEqual(['after']);
  });
});

describe('dayTimeline', () => {
  it('separates deadlines and all-day items and places timed ones by local hour', () => {
    const timeline = dayTimeline(
      [
        item('nine', { scheduledStart: '2026-11-04T12:00:00.000Z' }),
        item('nine2', { scheduledStart: '2026-11-04T12:30:00.000Z' }),
        item('midnight', { scheduledStart: '2026-11-04T03:00:00.000Z' }),
        item('late', { scheduledStart: '2026-11-05T02:59:00.000Z' }),
        item('all', { scheduledStart: '2026-11-04T03:00:00.000Z' }, { scheduleType: 'all_day' }),
        item('due', { scheduledDue: '2026-11-05T02:59:00.000Z' }, { scheduleType: 'deadline' }),
      ],
      SP,
    );
    expect(timeline.hours).toHaveLength(24);
    expect(timeline.hours[9]!.map(({ id }) => id)).toEqual(['nine', 'nine2']);
    expect(timeline.hours[0]!.map(({ id }) => id)).toEqual(['midnight']);
    expect(timeline.hours[23]!.map(({ id }) => id)).toEqual(['late']);
    expect(timeline.allDay.map(({ id }) => id)).toEqual(['all']);
    expect(timeline.deadlines.map(({ id }) => id)).toEqual(['due']);
  });

  it('puts the repeated hour of a clock change in one slot', () => {
    // New York, 2026-11-01: 01:30 happens at 05:30Z and again at 06:30Z.
    const timeline = dayTimeline(
      [
        item('first', { scheduledStart: '2026-11-01T05:30:00.000Z' }),
        item('second', { scheduledStart: '2026-11-01T06:30:00.000Z' }),
      ],
      'America/New_York',
    );
    expect(timeline.hours[1]!.map(({ id }) => id)).toEqual(['first', 'second']);
  });
});
