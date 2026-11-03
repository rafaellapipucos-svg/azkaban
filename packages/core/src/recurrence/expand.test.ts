import { describe, expect, it } from 'vitest';
import { expandOccurrences, taskAnchor, type ExpandableTask } from './expand';

const SP = 'America/Sao_Paulo';
const NY = 'America/New_York';

const task = (overrides: Partial<ExpandableTask>): ExpandableTask => ({
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

/** Hour on the clock of `timezone`, to assert that 9am stays 9am. */
const localHour = (instant: string, timezone: string) =>
  Number(
    new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hour: 'numeric',
      hourCycle: 'h23',
    }).format(new Date(instant)),
  );

describe('expandOccurrences: basics', () => {
  it('expands a daily rule and returns UTC instants', () => {
    expect(expandOccurrences(task({}), '2026-11-02T00:00:00Z', '2026-11-05T00:00:00Z')).toEqual([
      { scheduledStart: '2026-11-02T12:00:00.000Z', scheduledDue: '2026-11-02T12:00:00.000Z' },
      { scheduledStart: '2026-11-03T12:00:00.000Z', scheduledDue: '2026-11-03T12:00:00.000Z' },
      { scheduledStart: '2026-11-04T12:00:00.000Z', scheduledDue: '2026-11-04T12:00:00.000Z' },
    ]);
  });

  it('accepts offsets such as +00:00, the way Postgres prints them', () => {
    const t = task({ startAt: '2026-11-02T12:00:00+00:00' });
    expect(starts(t, '2026-11-02T00:00:00+00:00', '2026-11-03T00:00:00+00:00')).toEqual([
      '2026-11-02T12:00:00.000Z',
    ]);
  });

  it('is half-open: includes `from`, excludes `to`', () => {
    const t = task({});
    expect(starts(t, '2026-11-03T12:00:00Z', '2026-11-05T12:00:00Z')).toEqual([
      '2026-11-03T12:00:00.000Z',
      '2026-11-04T12:00:00.000Z',
    ]);
  });

  it('chains: two adjacent windows give the same as one', () => {
    const t = task({ rrule: 'FREQ=WEEKLY;BYDAY=MO,TH' });
    const a = '2026-11-02T00:00:00Z';
    const b = '2026-11-19T12:00:00Z'; // exactly on an occurrence
    const c = '2027-02-01T00:00:00Z';
    expect([...starts(t, a, b), ...starts(t, b, c)]).toEqual(starts(t, a, c));
  });

  it('returns nothing for an empty or inverted window', () => {
    expect(starts(task({}), '2026-11-05T00:00:00Z', '2026-11-05T00:00:00Z')).toEqual([]);
    expect(starts(task({}), '2026-11-06T00:00:00Z', '2026-11-05T00:00:00Z')).toEqual([]);
  });

  it('yields the single occurrence of a task without a rule', () => {
    const single = task({ rrule: null });
    expect(starts(single, '2026-11-01T00:00:00Z', '2026-11-30T00:00:00Z')).toEqual([
      '2026-11-02T12:00:00.000Z',
    ]);
    expect(starts(single, '2026-11-03T00:00:00Z', '2026-11-30T00:00:00Z')).toEqual([]);
  });

  it('takes the anchor from startAt, or from dueAt when there is no start', () => {
    expect(taskAnchor({ startAt: 'a', dueAt: 'b' })).toBe('a');
    expect(taskAnchor({ startAt: null, dueAt: 'b' })).toBe('b');
    expect(() => taskAnchor({ startAt: null, dueAt: null })).toThrow('task_without_anchor');
  });
});

describe('expandOccurrences: the anchor rule', () => {
  it('never yields anything before the anchor, whatever the window', () => {
    expect(starts(task({}), '2026-01-01T00:00:00Z', '2026-11-04T00:00:00Z')).toEqual([
      '2026-11-02T12:00:00.000Z',
      '2026-11-03T12:00:00.000Z',
    ]);
  });

  it('keeps the time of day of the anchor', () => {
    const t = task({ startAt: '2026-11-02T20:45:00.000Z' }); // 17:45 in Sao Paulo
    expect(starts(t, '2026-11-03T00:00:00Z', '2026-11-04T00:00:00Z')).toEqual([
      '2026-11-03T20:45:00.000Z',
    ]);
  });

  it('starts at the first day that fits the rule when the anchor does not fit it', () => {
    // Monday 2 Nov is the anchor, but the rule asks for Wednesdays.
    const t = task({ rrule: 'FREQ=WEEKLY;BYDAY=WE' });
    expect(starts(t, '2026-11-01T00:00:00Z', '2026-11-12T00:00:00Z')).toEqual([
      '2026-11-04T12:00:00.000Z',
      '2026-11-11T12:00:00.000Z',
    ]);
  });

  it('starts a monthly rule in the month after an anchor that is past the day', () => {
    const t = task({ startAt: '2026-11-15T12:00:00.000Z', rrule: 'FREQ=MONTHLY;BYMONTHDAY=10' });
    expect(starts(t, '2026-01-01T00:00:00Z', '2027-02-01T00:00:00Z')).toEqual([
      '2026-12-10T12:00:00.000Z',
      '2027-01-10T12:00:00.000Z',
    ]);
  });

  it('respects the interval from the anchor week', () => {
    const t = task({ rrule: 'FREQ=WEEKLY;INTERVAL=2;BYDAY=MO' });
    expect(starts(t, '2026-11-01T00:00:00Z', '2026-12-15T00:00:00Z')).toEqual([
      '2026-11-02T12:00:00.000Z',
      '2026-11-16T12:00:00.000Z',
      '2026-11-30T12:00:00.000Z',
      '2026-12-14T12:00:00.000Z',
    ]);
  });
});

describe('expandOccurrences: EXDATE', () => {
  const weekly = task({ rrule: 'FREQ=WEEKLY;BYDAY=MO,WE,FR' });
  const window = ['2026-11-02T00:00:00Z', '2026-11-09T00:00:00Z'] as const;

  it('removes the instance of an excluded local day', () => {
    expect(starts({ ...weekly, exdates: ['2026-11-04'] }, ...window)).toEqual([
      '2026-11-02T12:00:00.000Z',
      '2026-11-06T12:00:00.000Z',
    ]);
  });

  it('ignores a day the rule does not reach: it is inert', () => {
    // Tuesday and Saturday are not in the rule.
    expect(starts({ ...weekly, exdates: ['2026-11-03', '2026-11-07'] }, ...window)).toHaveLength(3);
  });

  it('does not shift an excluded day onto another: Saturday out does not exclude Sunday', () => {
    const excluded = ['2026-11-07']; // Saturday
    const toSaturdaySunday = task({ rrule: 'FREQ=WEEKLY;BYDAY=SA,SU', exdates: excluded });
    // Saturday is out; Sunday is a different day and is not excluded.
    expect(starts(toSaturdaySunday, ...window)).toEqual(['2026-11-08T12:00:00.000Z']);
    const toSunday = task({ rrule: 'FREQ=WEEKLY;BYDAY=SU', exdates: excluded });
    expect(starts(toSunday, ...window)).toEqual(['2026-11-08T12:00:00.000Z']);
  });

  it('can exclude the anchor itself', () => {
    expect(starts({ ...weekly, exdates: ['2026-11-02'] }, ...window)).toEqual([
      '2026-11-04T12:00:00.000Z',
      '2026-11-06T12:00:00.000Z',
    ]);
  });

  it('removes the only occurrence of a task without a rule', () => {
    const single = task({ rrule: null, exdates: ['2026-11-02'] });
    expect(starts(single, ...window)).toEqual([]);
  });

  it('does not count excluded days as extra COUNT: they still use up the count', () => {
    const t = task({ rrule: 'FREQ=DAILY;COUNT=3', exdates: ['2026-11-03'] });
    expect(starts(t, '2026-11-01T00:00:00Z', '2027-01-01T00:00:00Z')).toEqual([
      '2026-11-02T12:00:00.000Z',
      '2026-11-04T12:00:00.000Z',
    ]);
  });

  it('keeps the day out after the time of day changes', () => {
    const exdates = ['2026-11-04'];
    for (const startAt of [
      '2026-11-02T12:00:00.000Z',
      '2026-11-02T23:30:00.000Z',
      '2026-11-02T03:00:00.000Z',
    ]) {
      const days = starts({ ...weekly, startAt, exdates }, ...window).map((s) => s.slice(0, 10));
      expect(days.some((d) => d === '2026-11-04')).toBe(false);
      expect(days).toHaveLength(2);
    }
  });

  it('keeps the day out after the time zone changes', () => {
    const exdates = ['2026-11-04'];
    for (const timezone of [SP, NY, 'Asia/Tokyo']) {
      const t = { ...weekly, timezone, startAt: '2026-11-02T14:00:00.000Z', exdates };
      // Mon, Wed and Fri at 14:00 UTC, which is the same local day in all three zones.
      expect(starts(t, '2026-11-01T00:00:00Z', '2026-11-08T00:00:00Z')).toEqual([
        '2026-11-02T14:00:00.000Z',
        '2026-11-06T14:00:00.000Z',
      ]);
    }
  });

  it('uses the local day of the zone, not the UTC day', () => {
    // 23:30 in Sao Paulo is 02:30 UTC on the next day.
    const t = task({ startAt: '2026-11-03T02:30:00.000Z', rrule: 'FREQ=DAILY' }); // 2 Nov 23:30
    expect(starts(t, '2026-11-03T00:00:00Z', '2026-11-06T00:00:00Z')).toEqual([
      '2026-11-03T02:30:00.000Z',
      '2026-11-04T02:30:00.000Z',
      '2026-11-05T02:30:00.000Z',
    ]);
    // Excluding 3 Nov removes the instance at 2026-11-04T02:30Z (3 Nov 23:30 local), not the 03 UTC one.
    expect(
      starts({ ...t, exdates: ['2026-11-03'] }, '2026-11-03T00:00:00Z', '2026-11-06T00:00:00Z'),
    ).toEqual(['2026-11-03T02:30:00.000Z', '2026-11-05T02:30:00.000Z']);
    // The UTC date of that instance does not exclude it.
    expect(
      starts({ ...t, exdates: ['2026-11-04'] }, '2026-11-03T00:00:00Z', '2026-11-06T00:00:00Z'),
    ).toEqual(['2026-11-03T02:30:00.000Z', '2026-11-04T02:30:00.000Z']);
  });

  describe('across a DST change in New York', () => {
    it('spring forward: the missing 02:30 is moved to 03:30 and the day stays excluded', () => {
      const base = task({ timezone: NY, startAt: '2026-03-07T07:30:00.000Z', rrule: 'FREQ=DAILY' });
      const window = ['2026-03-07T00:00:00Z', '2026-03-10T00:00:00Z'] as const;
      expect(starts({ ...base, exdates: ['2026-03-08'] }, ...window)).toEqual([
        '2026-03-07T07:30:00.000Z',
        '2026-03-09T06:30:00.000Z',
      ]);
    });

    it('fall back: the repeated 01:30 is one instance, and the day stays excluded', () => {
      const base = task({ timezone: NY, startAt: '2026-10-31T05:30:00.000Z', rrule: 'FREQ=DAILY' });
      const window = ['2026-10-31T00:00:00Z', '2026-11-03T00:00:00Z'] as const;
      expect(starts({ ...base, exdates: ['2026-11-01'] }, ...window)).toEqual([
        '2026-10-31T05:30:00.000Z',
        '2026-11-02T06:30:00.000Z',
      ]);
    });

    it('a day excluded before the change stays excluded when the offset moves the instance', () => {
      // 09:00 daily: 14:00Z before 8 Mar, 13:00Z after. The excluded day is the 9th.
      const t = task({
        timezone: NY,
        startAt: '2026-03-06T14:00:00.000Z',
        rrule: 'FREQ=DAILY',
        exdates: ['2026-03-09'],
      });
      expect(starts(t, '2026-03-08T00:00:00Z', '2026-03-11T00:00:00Z')).toEqual([
        '2026-03-08T13:00:00.000Z',
        '2026-03-10T13:00:00.000Z',
      ]);
    });
  });
});

describe('expandOccurrences: COUNT and UNTIL', () => {
  it('stops at COUNT, counted from the anchor and not from the window', () => {
    const t = task({ rrule: 'FREQ=DAILY;COUNT=5' });
    expect(starts(t, '2026-11-01T00:00:00Z', '2027-01-01T00:00:00Z')).toHaveLength(5);
    expect(starts(t, '2026-11-05T00:00:00Z', '2027-01-01T00:00:00Z')).toEqual([
      '2026-11-05T12:00:00.000Z',
      '2026-11-06T12:00:00.000Z',
    ]);
  });

  it('includes the occurrence of the UNTIL day and nothing after it', () => {
    // End of 4 Nov in Sao Paulo is 02:59:59 UTC on the 5th.
    const t = task({ rrule: 'FREQ=DAILY;UNTIL=20261105T025959Z' });
    expect(starts(t, '2026-11-01T00:00:00Z', '2027-01-01T00:00:00Z')).toEqual([
      '2026-11-02T12:00:00.000Z',
      '2026-11-03T12:00:00.000Z',
      '2026-11-04T12:00:00.000Z',
    ]);
  });

  it('compares UNTIL on the local clock, across a DST change', () => {
    // 09:00 New York daily until the end of Sunday 8 Mar 2026, the day clocks go forward.
    const t = task({
      timezone: NY,
      startAt: '2026-03-06T14:00:00.000Z',
      rrule: 'FREQ=DAILY;UNTIL=20260309T035959Z',
    });
    expect(starts(t, '2026-03-01T00:00:00Z', '2026-04-01T00:00:00Z')).toEqual([
      '2026-03-06T14:00:00.000Z',
      '2026-03-07T14:00:00.000Z',
      '2026-03-08T13:00:00.000Z',
    ]);
  });
});

describe('expandOccurrences: month ends', () => {
  const monthly = (day: number, startAt: string, interval = 1) =>
    task({
      startAt,
      rrule:
        `FREQ=MONTHLY;INTERVAL=${interval};` +
        (day <= 28
          ? `BYMONTHDAY=${day}`
          : `BYMONTHDAY=${Array.from({ length: day - 27 }, (_, i) => 28 + i).join(',')};BYSETPOS=-1`),
    });
  const localDates = (t: ExpandableTask, from: string, to: string) =>
    starts(t, from, to).map((s) => s.slice(0, 10));

  it('every 31st: falls on the last day of the shorter months instead of skipping them', () => {
    expect(
      localDates(
        monthly(31, '2027-01-31T12:00:00.000Z'),
        '2027-01-01T00:00:00Z',
        '2028-01-01T00:00:00Z',
      ),
    ).toEqual([
      '2027-01-31',
      '2027-02-28',
      '2027-03-31',
      '2027-04-30',
      '2027-05-31',
      '2027-06-30',
      '2027-07-31',
      '2027-08-31',
      '2027-09-30',
      '2027-10-31',
      '2027-11-30',
      '2027-12-31',
    ]);
  });

  it('every 30th: the 30th, and February 28 or 29', () => {
    expect(
      localDates(
        monthly(30, '2027-12-30T12:00:00.000Z'),
        '2027-12-01T00:00:00Z',
        '2028-04-01T00:00:00Z',
      ),
    ).toEqual(['2027-12-30', '2028-01-30', '2028-02-29', '2028-03-30']);
  });

  it('every 29th: February 28 in a common year, the 29th in a leap year', () => {
    const t = monthly(29, '2027-01-29T12:00:00.000Z');
    expect(localDates(t, '2027-01-01T00:00:00Z', '2027-04-01T00:00:00Z')).toEqual([
      '2027-01-29',
      '2027-02-28',
      '2027-03-29',
    ]);
    expect(
      localDates(
        monthly(29, '2028-01-29T12:00:00.000Z'),
        '2028-01-01T00:00:00Z',
        '2028-04-01T00:00:00Z',
      ),
    ).toEqual(['2028-01-29', '2028-02-29', '2028-03-29']);
  });

  it('the 28th is never clamped', () => {
    expect(
      localDates(
        monthly(28, '2027-01-28T12:00:00.000Z'),
        '2027-01-01T00:00:00Z',
        '2027-04-01T00:00:00Z',
      ),
    ).toEqual(['2027-01-28', '2027-02-28', '2027-03-28']);
  });

  it('keeps the clamp with an interval', () => {
    expect(
      localDates(
        monthly(31, '2027-01-31T12:00:00.000Z', 3),
        '2027-01-01T00:00:00Z',
        '2028-01-01T00:00:00Z',
      ),
    ).toEqual(['2027-01-31', '2027-04-30', '2027-07-31', '2027-10-31']);
  });

  it('gives one occurrence per month, never two', () => {
    const t = monthly(31, '2027-01-31T12:00:00.000Z');
    const months = localDates(t, '2027-01-01T00:00:00Z', '2030-01-01T00:00:00Z').map((d) =>
      d.slice(0, 7),
    );
    expect(new Set(months).size).toBe(months.length);
    expect(months).toHaveLength(36);
  });
});

describe('expandOccurrences: time zones', () => {
  it('Sao Paulo has no offset change today: every 9am is 12:00 UTC', () => {
    const all = starts(task({}), '2026-01-01T00:00:00Z', '2027-01-01T00:00:00Z');
    expect(all).toHaveLength(60);
    expect(new Set(all.map((s) => s.slice(11))).size).toBe(1);
  });

  it('New York: 9am stays 9am through both changes of offset in a year', () => {
    const t = task({ timezone: NY, startAt: '2026-01-05T14:00:00.000Z' });
    const all = starts(t, '2026-01-01T00:00:00Z', '2027-01-01T00:00:00Z');
    expect(all).toHaveLength(361);
    expect(new Set(all.map((s) => localHour(s, NY)))).toEqual(new Set([9]));
    // The UTC hour moves from 14 to 13 and back.
    expect(new Set(all.map((s) => s.slice(11, 13)))).toEqual(new Set(['13', '14']));
  });

  it('New York, spring forward: 8 Mar 2026', () => {
    const t = task({ timezone: NY, startAt: '2026-03-06T14:00:00.000Z' });
    expect(starts(t, '2026-03-06T00:00:00Z', '2026-03-11T00:00:00Z')).toEqual([
      '2026-03-06T14:00:00.000Z', // EST
      '2026-03-07T14:00:00.000Z', // EST
      '2026-03-08T13:00:00.000Z', // EDT: one hour earlier in UTC
      '2026-03-09T13:00:00.000Z',
      '2026-03-10T13:00:00.000Z',
    ]);
  });

  it('New York, fall back: 1 Nov 2026', () => {
    const t = task({ timezone: NY, startAt: '2026-10-30T13:00:00.000Z' });
    expect(starts(t, '2026-10-30T00:00:00Z', '2026-11-04T00:00:00Z')).toEqual([
      '2026-10-30T13:00:00.000Z', // EDT
      '2026-10-31T13:00:00.000Z', // EDT
      '2026-11-01T14:00:00.000Z', // EST: one hour later in UTC
      '2026-11-02T14:00:00.000Z',
      '2026-11-03T14:00:00.000Z',
    ]);
  });

  it('a time that does not exist moves forward, and returns to normal the day after', () => {
    // 02:30 daily in New York. 8 Mar 2026 has no 02:30.
    const t = task({ timezone: NY, startAt: '2026-03-07T07:30:00.000Z' });
    expect(starts(t, '2026-03-07T00:00:00Z', '2026-03-10T00:00:00Z')).toEqual([
      '2026-03-07T07:30:00.000Z', // 02:30 EST
      '2026-03-08T07:30:00.000Z', // 03:30 EDT
      '2026-03-09T06:30:00.000Z', // 02:30 EDT
    ]);
  });

  it('a time that happens twice yields one occurrence that day, the first', () => {
    // 01:30 daily in New York. 1 Nov 2026 has two.
    const t = task({ timezone: NY, startAt: '2026-10-31T05:30:00.000Z' });
    expect(starts(t, '2026-10-31T00:00:00Z', '2026-11-03T00:00:00Z')).toEqual([
      '2026-10-31T05:30:00.000Z', // 01:30 EDT
      '2026-11-01T05:30:00.000Z', // 01:30 EDT, first time
      '2026-11-02T06:30:00.000Z', // 01:30 EST
    ]);
  });

  it('keeps the anchor itself when it is the second 01:30', () => {
    const t = task({ timezone: NY, startAt: '2026-11-01T06:30:00.000Z' });
    expect(starts(t, '2026-11-01T00:00:00Z', '2026-11-03T00:00:00Z')).toEqual([
      '2026-11-01T06:30:00.000Z',
      '2026-11-02T06:30:00.000Z',
    ]);
  });

  it('weekly rules follow the local weekday, not the UTC one', () => {
    // Friday 22:00 in Sao Paulo is already Saturday 01:00 UTC.
    const t = task({
      startAt: '2026-11-07T01:00:00.000Z',
      rrule: 'FREQ=WEEKLY;BYDAY=FR',
    });
    expect(starts(t, '2026-11-01T00:00:00Z', '2026-11-22T00:00:00Z')).toEqual([
      '2026-11-07T01:00:00.000Z',
      '2026-11-14T01:00:00.000Z',
      '2026-11-21T01:00:00.000Z',
    ]);
  });

  it('a monthly clamp in New York across a DST change keeps 9am local', () => {
    const t = task({
      timezone: NY,
      startAt: '2027-01-31T14:00:00.000Z',
      rrule: 'FREQ=MONTHLY;BYMONTHDAY=28,29,30,31;BYSETPOS=-1',
    });
    expect(starts(t, '2027-01-01T00:00:00Z', '2027-06-01T00:00:00Z')).toEqual([
      '2027-01-31T14:00:00.000Z',
      '2027-02-28T14:00:00.000Z',
      '2027-03-31T13:00:00.000Z', // EDT since 14 Mar 2027
      '2027-04-30T13:00:00.000Z',
      '2027-05-31T13:00:00.000Z',
    ]);
  });
});

describe('expandOccurrences: scheduledDue', () => {
  it('timed: start plus the duration', () => {
    const t = task({ durationMin: 90 });
    expect(expandOccurrences(t, '2026-11-02T00:00:00Z', '2026-11-03T00:00:00Z')).toEqual([
      { scheduledStart: '2026-11-02T12:00:00.000Z', scheduledDue: '2026-11-02T13:30:00.000Z' },
    ]);
  });

  it('timed without duration: the start itself', () => {
    const [first] = expandOccurrences(task({}), '2026-11-02T00:00:00Z', '2026-11-03T00:00:00Z');
    expect(first?.scheduledDue).toBe(first?.scheduledStart);
  });

  it('all_day: local midnight of the next day', () => {
    // Local midnight of 2 Nov in Sao Paulo is 03:00 UTC.
    const t = task({ scheduleType: 'all_day', startAt: '2026-11-02T03:00:00.000Z' });
    expect(expandOccurrences(t, '2026-11-02T00:00:00Z', '2026-11-04T00:00:00Z')).toEqual([
      { scheduledStart: '2026-11-02T03:00:00.000Z', scheduledDue: '2026-11-03T03:00:00.000Z' },
      { scheduledStart: '2026-11-03T03:00:00.000Z', scheduledDue: '2026-11-04T03:00:00.000Z' },
    ]);
  });

  it('all_day on the day clocks go forward lasts 23 hours', () => {
    const t = task({
      scheduleType: 'all_day',
      timezone: NY,
      startAt: '2026-03-07T05:00:00.000Z', // 00:00 EST
    });
    expect(expandOccurrences(t, '2026-03-08T00:00:00Z', '2026-03-09T00:00:00Z')).toEqual([
      { scheduledStart: '2026-03-08T05:00:00.000Z', scheduledDue: '2026-03-09T04:00:00.000Z' },
    ]);
  });

  it('deadline without a start: start and due are the same moment', () => {
    const t = task({
      scheduleType: 'deadline',
      startAt: null,
      dueAt: '2026-11-02T14:00:00.000Z',
    });
    expect(expandOccurrences(t, '2026-11-02T00:00:00Z', '2026-11-04T00:00:00Z')).toEqual([
      { scheduledStart: '2026-11-02T14:00:00.000Z', scheduledDue: '2026-11-02T14:00:00.000Z' },
      { scheduledStart: '2026-11-03T14:00:00.000Z', scheduledDue: '2026-11-03T14:00:00.000Z' },
    ]);
  });

  it('deadline with a start: the due moves along with the anchor, in local time', () => {
    // Start 09:00 on Thu 5 Mar, due 17:00 on Sat 7 Mar, New York (EST on both).
    const t = task({
      scheduleType: 'deadline',
      timezone: NY,
      startAt: '2026-03-05T14:00:00.000Z',
      dueAt: '2026-03-07T22:00:00.000Z',
    });
    expect(expandOccurrences(t, '2026-03-05T00:00:00Z', '2026-03-08T00:00:00Z')).toEqual([
      { scheduledStart: '2026-03-05T14:00:00.000Z', scheduledDue: '2026-03-07T22:00:00.000Z' },
      { scheduledStart: '2026-03-06T14:00:00.000Z', scheduledDue: '2026-03-08T21:00:00.000Z' }, // 17:00 EDT
      { scheduledStart: '2026-03-07T14:00:00.000Z', scheduledDue: '2026-03-09T21:00:00.000Z' },
    ]);
  });

  it('every occurrence starts at or before its due', () => {
    const t = task({ durationMin: 15, timezone: NY, startAt: '2026-03-06T14:00:00.000Z' });
    for (const o of expandOccurrences(t, '2026-03-01T00:00:00Z', '2026-12-01T00:00:00Z')) {
      expect(Date.parse(o.scheduledStart)).toBeLessThanOrEqual(Date.parse(o.scheduledDue));
    }
  });
});

describe('expandOccurrences: older anchors', () => {
  it('expands a window far from the anchor without drifting', () => {
    const t = task({ startAt: '2023-05-01T12:00:00.000Z', rrule: 'FREQ=WEEKLY;BYDAY=MO' });
    const all = starts(t, '2026-11-01T00:00:00Z', '2026-12-01T00:00:00Z');
    expect(all).toEqual([
      '2026-11-02T12:00:00.000Z',
      '2026-11-09T12:00:00.000Z',
      '2026-11-16T12:00:00.000Z',
      '2026-11-23T12:00:00.000Z',
      '2026-11-30T12:00:00.000Z',
    ]);
  });
});
