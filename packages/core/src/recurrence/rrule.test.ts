import { recurrenceInputSchema, type RecurrenceInput } from '@azkaban/contracts';
import { describe, expect, it } from 'vitest';
import { fromRRule, toRRule } from './rrule';

const SP = 'America/Sao_Paulo';
const NY = 'America/New_York';
const anchor = '2026-11-02T12:00:00.000Z';

const input = (overrides: Partial<RecurrenceInput>): RecurrenceInput => ({
  frequency: 'daily',
  interval: 1,
  weekdays: [],
  monthDay: null,
  end: { type: 'never' },
  ...overrides,
});

describe('toRRule', () => {
  it.each([
    ['daily', input({}), 'FREQ=DAILY'],
    ['every 3 days', input({ interval: 3 }), 'FREQ=DAILY;INTERVAL=3'],
    [
      'weekly',
      input({ frequency: 'weekly', weekdays: ['MO', 'WE', 'FR'] }),
      'FREQ=WEEKLY;BYDAY=MO,WE,FR',
    ],
    [
      'weekly, weekdays out of order',
      input({ frequency: 'weekly', weekdays: ['FR', 'SU', 'MO'] }),
      'FREQ=WEEKLY;BYDAY=MO,FR,SU',
    ],
    [
      'every other week',
      input({ frequency: 'weekly', interval: 2, weekdays: ['SU'] }),
      'FREQ=WEEKLY;INTERVAL=2;BYDAY=SU',
    ],
    ['monthly day 1', input({ frequency: 'monthly', monthDay: 1 }), 'FREQ=MONTHLY;BYMONTHDAY=1'],
    ['monthly day 28', input({ frequency: 'monthly', monthDay: 28 }), 'FREQ=MONTHLY;BYMONTHDAY=28'],
    [
      'monthly day 29 clamps',
      input({ frequency: 'monthly', monthDay: 29 }),
      'FREQ=MONTHLY;BYMONTHDAY=28,29;BYSETPOS=-1',
    ],
    [
      'monthly day 30 clamps',
      input({ frequency: 'monthly', monthDay: 30 }),
      'FREQ=MONTHLY;BYMONTHDAY=28,29,30;BYSETPOS=-1',
    ],
    [
      'every other month on the 31st',
      input({ frequency: 'monthly', interval: 2, monthDay: 31 }),
      'FREQ=MONTHLY;INTERVAL=2;BYMONTHDAY=28,29,30,31;BYSETPOS=-1',
    ],
    ['count', input({ end: { type: 'after_count', count: 10 } }), 'FREQ=DAILY;COUNT=10'],
  ])('%s', (_label, recurrence, want) => {
    expect(toRRule(recurrence, anchor, SP)).toBe(want);
  });

  it('writes UNTIL in UTC at the end of the local day', () => {
    const until = input({ end: { type: 'on_date', date: '2026-12-31' } });
    // 23:59:59 at -03:00 is 02:59:59 UTC the next day.
    expect(toRRule(until, anchor, SP)).toBe('FREQ=DAILY;UNTIL=20270101T025959Z');
    // 23:59:59 at -05:00 (EST) is 04:59:59 UTC; at -04:00 (EDT), 03:59:59 UTC.
    expect(toRRule(until, anchor, NY)).toBe('FREQ=DAILY;UNTIL=20270101T045959Z');
    expect(
      toRRule(input({ end: { type: 'on_date', date: '2026-11-01' } }), '2026-10-01T12:00:00Z', NY),
    ).toBe('FREQ=DAILY;UNTIL=20261102T045959Z');
    expect(
      toRRule(input({ end: { type: 'on_date', date: '2026-07-04' } }), '2026-07-01T12:00:00Z', NY),
    ).toBe('FREQ=DAILY;UNTIL=20260705T035959Z');
  });

  it('never writes DTSTART or a zone: the anchor and the zone live on the task', () => {
    const rule = toRRule(input({ end: { type: 'on_date', date: '2026-12-31' } }), anchor, SP);
    expect(rule).not.toMatch(/DTSTART|TZID/);
  });

  it('lets a rule end on the day of the anchor, but not before it', () => {
    expect(() =>
      toRRule(input({ end: { type: 'on_date', date: '2026-11-02' } }), anchor, SP),
    ).not.toThrow();
    expect(() =>
      toRRule(input({ end: { type: 'on_date', date: '2026-11-01' } }), anchor, SP),
    ).toThrow('recurrence_ends_before_anchor');
  });

  it('judges "before the anchor" by the local day, not the UTC day', () => {
    // 01:00 UTC on Nov 3 is still Nov 2 at 22:00 in Sao Paulo.
    const lateAnchor = '2026-11-03T01:00:00.000Z';
    expect(() =>
      toRRule(input({ end: { type: 'on_date', date: '2026-11-02' } }), lateAnchor, SP),
    ).not.toThrow();
  });
});

describe('fromRRule is the inverse of toRRule', () => {
  const ends: RecurrenceInput['end'][] = [
    { type: 'never' },
    { type: 'after_count', count: 1 },
    { type: 'after_count', count: 730 },
    { type: 'on_date', date: '2026-11-02' },
    { type: 'on_date', date: '2030-02-28' },
  ];
  const shapes: Omit<RecurrenceInput, 'end'>[] = [
    { frequency: 'daily', interval: 1, weekdays: [], monthDay: null },
    { frequency: 'daily', interval: 99, weekdays: [], monthDay: null },
    { frequency: 'weekly', interval: 1, weekdays: ['MO'], monthDay: null },
    {
      frequency: 'weekly',
      interval: 1,
      weekdays: ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'],
      monthDay: null,
    },
    { frequency: 'weekly', interval: 3, weekdays: ['TU', 'TH'], monthDay: null },
    ...Array.from({ length: 31 }, (_, i) => ({
      frequency: 'monthly' as const,
      interval: 1,
      weekdays: [],
      monthDay: i + 1,
    })),
    { frequency: 'monthly', interval: 12, weekdays: [], monthDay: 31 },
  ];

  const cases = shapes.flatMap((shape) =>
    ends.flatMap((end) =>
      [SP, NY].map((timezone) => ({ recurrence: { ...shape, end }, timezone })),
    ),
  );

  it(`round-trips ${cases.length} combinations of frequency, interval, days, end and zone`, () => {
    for (const { recurrence, timezone } of cases) {
      expect(recurrenceInputSchema.safeParse(recurrence).success).toBe(true);
      const rule = toRRule(recurrence, anchor, timezone);
      expect(fromRRule(rule, timezone)).toEqual(recurrence);
    }
  });

  it('reads the date of UNTIL in the zone of the task, not in UTC', () => {
    // 02:59:59 UTC on Jan 1 is still Dec 31 in Sao Paulo, but already Dec 31 21:59 in New York too.
    expect(fromRRule('FREQ=DAILY;UNTIL=20270101T025959Z', SP).end).toEqual({
      type: 'on_date',
      date: '2026-12-31',
    });
    expect(fromRRule('FREQ=DAILY;UNTIL=20270101T025959Z', 'UTC').end).toEqual({
      type: 'on_date',
      date: '2027-01-01',
    });
  });

  it('accepts the optional RRULE: prefix', () => {
    expect(fromRRule('RRULE:FREQ=WEEKLY;BYDAY=MO', SP).weekdays).toEqual(['MO']);
  });

  it('returns weekdays in Monday-first order whatever the order in the string', () => {
    expect(fromRRule('FREQ=WEEKLY;BYDAY=SU,MO,FR', SP).weekdays).toEqual(['MO', 'FR', 'SU']);
  });

  it.each([
    ['yearly', 'FREQ=YEARLY'],
    ['hourly', 'FREQ=HOURLY'],
    ['numbered weekday', 'FREQ=WEEKLY;BYDAY=1MO'],
    ['weekly without days', 'FREQ=WEEKLY'],
    ['monthly without a day', 'FREQ=MONTHLY'],
    ['nth weekday of the month', 'FREQ=MONTHLY;BYDAY=MO;BYSETPOS=1'],
    ['month day 31 without the clamp', 'FREQ=MONTHLY;BYMONTHDAY=31'],
    ['clamp that starts too late', 'FREQ=MONTHLY;BYMONTHDAY=29,30,31;BYSETPOS=-1'],
    ['clamp from the first', 'FREQ=MONTHLY;BYMONTHDAY=28,29,30,31;BYSETPOS=1'],
    ['by hour', 'FREQ=DAILY;BYHOUR=9'],
    ['weekdays on a daily rule', 'FREQ=DAILY;BYDAY=MO'],
  ])('refuses a rule the app does not generate: %s', (_label, rule) => {
    expect(() => fromRRule(rule, SP)).toThrow('unsupported_rrule');
  });
});
