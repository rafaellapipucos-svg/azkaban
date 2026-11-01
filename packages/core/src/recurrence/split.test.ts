import type { RecurrenceInput } from '@azkaban/contracts';
import { describe, expect, it } from 'vitest';
import { expandOccurrences, type ExpandableTask } from './expand';
import { fromRRule } from './rrule';
import { splitRecurrence } from './split';

const SP = 'America/Sao_Paulo';
const NY = 'America/New_York';

const recurrence = (overrides: Partial<RecurrenceInput>): RecurrenceInput => ({
  frequency: 'daily',
  interval: 1,
  weekdays: [],
  monthDay: null,
  end: { type: 'never' },
  ...overrides,
});

const series = (overrides: Partial<ExpandableTask>): ExpandableTask => ({
  scheduleType: 'timed',
  startAt: '2026-11-02T12:00:00.000Z', // Monday 09:00 in Sao Paulo
  dueAt: null,
  durationMin: null,
  timezone: SP,
  rrule: 'FREQ=DAILY',
  exdates: [],
  ...overrides,
});

const starts = (t: ExpandableTask, from: string, to: string) =>
  expandOccurrences(t, from, to).map((o) => o.scheduledStart);

describe('splitRecurrence: head and tail', () => {
  const task = series({});
  const pivot = '2026-11-10T12:00:00.000Z';

  it('ends the head at the end of the day before the pivot, and starts the tail at the pivot', () => {
    expect(splitRecurrence(task, pivot, recurrence({}))).toEqual({
      // End of 9 Nov in Sao Paulo is 02:59:59 UTC on the 10th.
      headRrule: 'FREQ=DAILY;UNTIL=20261110T025959Z',
      tailRrule: 'FREQ=DAILY',
    });
  });

  it('lets the tail change: the new rule is the one the editor sent', () => {
    const tail = recurrence({ frequency: 'weekly', interval: 2, weekdays: ['TU', 'TH'] });
    expect(splitRecurrence(task, pivot, tail).tailRrule).toBe('FREQ=WEEKLY;INTERVAL=2;BYDAY=TU,TH');
  });

  it('writes UNTIL of the head in UTC, as the ADR asks', () => {
    const { headRrule } = splitRecurrence(task, pivot, recurrence({}));
    expect(headRrule).toMatch(/UNTIL=\d{8}T\d{6}Z$/);
  });

  it('reads back in the editor as a plain end date, the day before the pivot', () => {
    const { headRrule } = splitRecurrence(task, pivot, recurrence({}));
    expect(fromRRule(headRrule!, SP).end).toEqual({ type: 'on_date', date: '2026-11-09' });
  });

  it('puts the tail on a rule that keeps the end of the original when the editor sends it', () => {
    const original = series({ rrule: 'FREQ=DAILY;UNTIL=20261121T025959Z' });
    const tail = recurrence({ end: { type: 'on_date', date: '2026-11-20' } });
    expect(splitRecurrence(original, pivot, tail)).toEqual({
      headRrule: 'FREQ=DAILY;UNTIL=20261110T025959Z',
      tailRrule: 'FREQ=DAILY;UNTIL=20261121T025959Z',
    });
  });
});

describe('splitRecurrence: the pivot is the first occurrence', () => {
  it('returns a null head, because the whole series changes (same as scope all)', () => {
    const result = splitRecurrence(series({}), '2026-11-02T12:00:00.000Z', recurrence({}));
    expect(result.headRrule).toBeNull();
    expect(result.tailRrule).toBe('FREQ=DAILY');
  });

  it('is the first occurrence of the rule, even when the anchor is not one', () => {
    // Anchor on Monday, rule on Wednesdays: the first occurrence is Wednesday 4 Nov.
    const task = series({ rrule: 'FREQ=WEEKLY;BYDAY=WE' });
    const tail = recurrence({ frequency: 'weekly', weekdays: ['WE'] });
    expect(splitRecurrence(task, '2026-11-04T12:00:00.000Z', tail).headRrule).toBeNull();
    expect(splitRecurrence(task, '2026-11-11T12:00:00.000Z', tail).headRrule).not.toBeNull();
  });

  it('returns a null head for a pivot at or before the anchor', () => {
    expect(
      splitRecurrence(series({}), '2026-10-01T12:00:00.000Z', recurrence({})).headRrule,
    ).toBeNull();
  });

  it('returns a null head for a task without a rule', () => {
    expect(
      splitRecurrence(series({ rrule: null }), '2026-11-02T12:00:00.000Z', recurrence({}))
        .headRrule,
    ).toBeNull();
  });

  it('keeps the head for the second occurrence', () => {
    expect(splitRecurrence(series({}), '2026-11-03T12:00:00.000Z', recurrence({})).headRrule).toBe(
      'FREQ=DAILY;UNTIL=20261103T025959Z',
    );
  });
});

describe('splitRecurrence: COUNT', () => {
  const task = series({ rrule: 'FREQ=DAILY;COUNT=10' });
  const pivot = '2026-11-06T12:00:00.000Z'; // the 5th occurrence: 4 come before it

  it('turns the COUNT of the head into UNTIL', () => {
    const { headRrule } = splitRecurrence(task, pivot, recurrence({}));
    expect(headRrule).toBe('FREQ=DAILY;UNTIL=20261106T025959Z');
    expect(headRrule).not.toContain('COUNT');
  });

  it('gives the tail what remains of the original COUNT', () => {
    const tail = recurrence({ end: { type: 'after_count', count: 10 } });
    expect(splitRecurrence(task, pivot, tail).tailRrule).toBe('FREQ=DAILY;COUNT=6');
  });

  it('gives the last occurrence a tail of one', () => {
    const last = '2026-11-11T12:00:00.000Z'; // 10th
    const tail = recurrence({ end: { type: 'after_count', count: 10 } });
    expect(splitRecurrence(task, last, tail).tailRrule).toBe('FREQ=DAILY;COUNT=1');
  });

  it('counts excluded days before the pivot, as RFC 5545 counts COUNT', () => {
    const withGaps = { ...task, exdates: ['2026-11-03', '2026-11-04'] };
    const tail = recurrence({ end: { type: 'after_count', count: 10 } });
    expect(splitRecurrence(withGaps, pivot, tail)).toEqual(splitRecurrence(task, pivot, tail));
    expect(splitRecurrence(withGaps, pivot, tail).tailRrule).toBe('FREQ=DAILY;COUNT=6');
  });

  it('adds nothing when the tail has no count', () => {
    expect(splitRecurrence(task, pivot, recurrence({})).tailRrule).toBe('FREQ=DAILY');
  });

  it('counts a series that had no COUNT from its first occurrence', () => {
    const open = series({});
    const tail = recurrence({ end: { type: 'after_count', count: 7 } });
    expect(splitRecurrence(open, pivot, tail).tailRrule).toBe('FREQ=DAILY;COUNT=3');
  });

  it('refuses a count that ends before the pivot', () => {
    const tail = recurrence({ end: { type: 'after_count', count: 4 } });
    expect(() => splitRecurrence(task, pivot, tail)).toThrow('count_before_pivot');
  });

  it('splitting an already shortened head works the same', () => {
    // Splitting twice: the second split sees the already shortened head.
    const first = splitRecurrence(
      task,
      pivot,
      recurrence({ end: { type: 'after_count', count: 10 } }),
    );
    const head = series({ rrule: first.headRrule });
    const second = splitRecurrence(head, '2026-11-04T12:00:00.000Z', recurrence({}));
    expect(second.headRrule).toBe('FREQ=DAILY;UNTIL=20261104T025959Z');
  });
});

describe('splitRecurrence: head and tail together are the original series', () => {
  const cases: {
    label: string;
    timezone: string;
    startAt: string;
    rrule: string;
    pivots: string[];
    tail: RecurrenceInput;
  }[] = [
    {
      label: 'daily with COUNT',
      timezone: SP,
      startAt: '2026-11-02T12:00:00.000Z',
      rrule: 'FREQ=DAILY;COUNT=20',
      pivots: ['2026-11-03T12:00:00.000Z', '2026-11-12T12:00:00.000Z', '2026-11-21T12:00:00.000Z'],
      tail: recurrence({ end: { type: 'after_count', count: 20 } }),
    },
    {
      label: 'weekly on several days',
      timezone: SP,
      startAt: '2026-11-02T12:00:00.000Z',
      rrule: 'FREQ=WEEKLY;BYDAY=MO,WE,FR',
      pivots: ['2026-11-04T12:00:00.000Z', '2026-11-13T12:00:00.000Z'],
      tail: recurrence({ frequency: 'weekly', weekdays: ['MO', 'WE', 'FR'] }),
    },
    {
      label: 'every other week, across the New York spring-forward',
      timezone: NY,
      startAt: '2026-03-02T14:00:00.000Z',
      rrule: 'FREQ=WEEKLY;INTERVAL=2;BYDAY=MO',
      pivots: ['2026-03-16T13:00:00.000Z', '2026-03-30T13:00:00.000Z'],
      tail: recurrence({ frequency: 'weekly', interval: 2, weekdays: ['MO'] }),
    },
    {
      label: 'daily across the New York fall-back, pivot on the change day',
      timezone: NY,
      startAt: '2026-10-28T13:00:00.000Z',
      rrule: 'FREQ=DAILY',
      pivots: ['2026-11-01T14:00:00.000Z', '2026-11-02T14:00:00.000Z'],
      tail: recurrence({}),
    },
    {
      label: 'monthly on the 31st',
      timezone: SP,
      startAt: '2027-01-31T12:00:00.000Z',
      rrule: 'FREQ=MONTHLY;BYMONTHDAY=28,29,30,31;BYSETPOS=-1',
      pivots: ['2027-02-28T12:00:00.000Z', '2027-04-30T12:00:00.000Z'],
      tail: recurrence({ frequency: 'monthly', monthDay: 31 }),
    },
  ];

  const window = ['2026-01-01T00:00:00Z', '2028-01-01T00:00:00Z'] as const;

  it.each(cases.flatMap((c) => c.pivots.map((pivot) => ({ ...c, pivot }))))(
    '$label, pivot $pivot',
    ({ timezone, startAt, rrule, pivot, tail }) => {
      const original = series({ timezone, startAt, rrule });
      const { headRrule, tailRrule } = splitRecurrence(original, pivot, tail);
      const head = starts(series({ timezone, startAt, rrule: headRrule }), ...window);
      const rest = starts(series({ timezone, startAt: pivot, rrule: tailRrule }), ...window);
      const want = starts(original, ...window);

      expect(headRrule).not.toBeNull();
      expect(rest[0]).toBe(pivot);
      expect([...head, ...rest]).toEqual(want);
      // No occurrence is in both halves.
      expect(head.filter((s) => rest.includes(s))).toEqual([]);
    },
  );
});
