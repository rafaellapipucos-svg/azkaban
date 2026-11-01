import type { RecurrenceInput } from '@azkaban/contracts';
import { describe, expect, it } from 'vitest';
import { alignToRule } from './align';

const SP = 'America/Sao_Paulo';
const rule = (overrides: Partial<RecurrenceInput>): RecurrenceInput => ({
  frequency: 'daily',
  interval: 1,
  weekdays: [],
  monthDay: null,
  end: { type: 'never' },
  ...overrides,
});
// Wednesday 2026-11-04 09:00 in Sao Paulo
const wednesday = '2026-11-04T12:00:00.000Z';
const timed = { scheduleType: 'timed', startAt: wednesday, dueAt: null, timezone: SP } as const;

describe('alignToRule', () => {
  it('keeps an anchor that is already on the rule', () => {
    expect(alignToRule(timed, rule({}))).toEqual({ startAt: wednesday, dueAt: null });
    const weekly = rule({ frequency: 'weekly', weekdays: ['WE', 'FR'] });
    expect(alignToRule(timed, weekly)).toEqual({ startAt: wednesday, dueAt: null });
  });

  it('moves a timed start to the first date of the rule, keeping the hour', () => {
    const weekly = rule({ frequency: 'weekly', weekdays: ['MO', 'FR'] });
    expect(alignToRule(timed, weekly)).toEqual({
      startAt: '2026-11-06T12:00:00.000Z',
      dueAt: null,
    });
  });

  it('moves an all-day start to local midnight of the first date', () => {
    const schedule = {
      scheduleType: 'all_day',
      startAt: '2026-11-04T03:00:00.000Z',
      dueAt: null,
      timezone: SP,
    } as const;
    const monthly = rule({ frequency: 'monthly', monthDay: 10 });
    expect(alignToRule(schedule, monthly).startAt).toBe('2026-11-10T03:00:00.000Z');
  });

  it('moves a deadline with a start and its due date by the same days', () => {
    const schedule = {
      scheduleType: 'deadline',
      startAt: '2026-11-04T03:00:00.000Z',
      dueAt: '2026-11-07T02:59:00.000Z',
      timezone: SP,
    } as const;
    const weekly = rule({ frequency: 'weekly', weekdays: ['FR'] });
    expect(alignToRule(schedule, weekly)).toEqual({
      startAt: '2026-11-06T03:00:00.000Z',
      dueAt: '2026-11-09T02:59:00.000Z',
    });
  });

  it('moves a deadline without a start to its due date', () => {
    const schedule = {
      scheduleType: 'deadline',
      startAt: null,
      dueAt: '2026-11-05T02:59:00.000Z',
      timezone: SP,
    } as const;
    const weekly = rule({ frequency: 'weekly', weekdays: ['FR'] });
    expect(alignToRule(schedule, weekly)).toEqual({
      startAt: null,
      dueAt: '2026-11-07T02:59:00.000Z',
    });
  });

  it('reaches past a skipped period with a long interval', () => {
    // Monday is behind the anchor's week, so the first date is two weeks on.
    const biweekly = rule({ frequency: 'weekly', interval: 2, weekdays: ['MO'] });
    expect(alignToRule(timed, biweekly).startAt).toBe('2026-11-16T12:00:00.000Z');
  });

  it('refuses a rule that ends before the anchor', () => {
    const ended = rule({ end: { type: 'on_date', date: '2026-11-01' } });
    expect(() => alignToRule(timed, ended)).toThrow('recurrence_ends_before_anchor');
  });

  it('refuses a rule whose end leaves no occurrence', () => {
    const ended = rule({
      frequency: 'weekly',
      weekdays: ['MO'],
      end: { type: 'on_date', date: '2026-11-05' },
    });
    expect(() => alignToRule(timed, ended)).toThrow('recurrence_has_no_occurrence');
  });
});
