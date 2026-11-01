import { describe, expect, it } from 'vitest';
import {
  addMonths,
  dayRange,
  daysBetween,
  lastOfMonth,
  monthGrid,
  shiftDate,
  startOfWeek,
  visibleRange,
  weekDays,
  weekdayIndex,
} from './calendarGrid';

const hours = ({ from, to }: { from: string; to: string }) =>
  (Date.parse(to) - Date.parse(from)) / 3_600_000;

describe('weekdayIndex and startOfWeek', () => {
  it('numbers Sunday as 0', () => {
    expect(weekdayIndex('2026-11-01')).toBe(0);
    expect(weekdayIndex('2026-11-04')).toBe(3);
  });

  it('finds the first day of the week for either convention', () => {
    // Wednesday 2026-11-04
    expect(startOfWeek('2026-11-04', 0)).toBe('2026-11-01');
    expect(startOfWeek('2026-11-04', 1)).toBe('2026-11-02');
    // The first day itself, and a Sunday when weeks start on Monday
    expect(startOfWeek('2026-11-01', 0)).toBe('2026-11-01');
    expect(startOfWeek('2026-11-01', 1)).toBe('2026-10-26');
  });

  it('lists seven days across a month and a year end', () => {
    expect(weekDays('2026-12-31', 0)).toEqual([
      '2026-12-27',
      '2026-12-28',
      '2026-12-29',
      '2026-12-30',
      '2026-12-31',
      '2027-01-01',
      '2027-01-02',
    ]);
  });
});

describe('months', () => {
  it('adds months across years', () => {
    expect(addMonths('2026-12', 1)).toBe('2027-01');
    expect(addMonths('2026-01', -1)).toBe('2025-12');
    expect(addMonths('2026-03', -15)).toBe('2024-12');
  });

  it('knows the last day, leap years included', () => {
    expect(lastOfMonth('2026-02')).toBe('2026-02-28');
    expect(lastOfMonth('2028-02')).toBe('2028-02-29');
    expect(lastOfMonth('2026-12')).toBe('2026-12-31');
  });

  it('keeps the day number or the last day of a shorter month', () => {
    expect(shiftDate('month', '2026-01-31', 1)).toBe('2026-02-28');
    expect(shiftDate('month', '2028-01-31', 1)).toBe('2028-02-29');
    expect(shiftDate('month', '2026-03-15', -1)).toBe('2026-02-15');
    expect(shiftDate('week', '2026-11-04', 1)).toBe('2026-11-11');
    expect(shiftDate('day', '2026-11-01', -1)).toBe('2026-10-31');
  });
});

describe('monthGrid', () => {
  it('starts on the first cell when the month begins on the first weekday', () => {
    // November 2026 starts on a Sunday and has 30 days: five rows, no days before it.
    const weeks = monthGrid('2026-11', 0);
    expect(weeks).toHaveLength(5);
    expect(weeks[0]![0]).toEqual({ date: '2026-11-01', inMonth: true });
    expect(weeks[4]![6]).toEqual({ date: '2026-12-05', inMonth: false });
  });

  it('takes exactly four rows for a 28-day month that starts on the first weekday', () => {
    // February 2026 starts on a Sunday.
    const weeks = monthGrid('2026-02', 0);
    expect(weeks).toHaveLength(4);
    expect(weeks.flat().every(({ inMonth }) => inMonth)).toBe(true);
  });

  it('borrows the days before it when weeks start on Monday', () => {
    const weeks = monthGrid('2026-11', 1);
    expect(weeks[0]![0]).toEqual({ date: '2026-10-26', inMonth: false });
    expect(weeks[0]![6]).toEqual({ date: '2026-11-01', inMonth: true });
    expect(weeks).toHaveLength(6);
  });

  it('always has full weeks in order, with no repeated or missing day', () => {
    for (const month of ['2026-01', '2026-05', '2026-08', '2027-02', '2028-02']) {
      for (const start of [0, 1, 6] as const) {
        const flat = monthGrid(month, start).flat();
        expect(flat.length % 7).toBe(0);
        flat.forEach(({ date }, index) => {
          if (index > 0) expect(daysBetween(flat[index - 1]!.date, date)).toBe(1);
        });
        expect(flat.filter(({ inMonth }) => inMonth)).toHaveLength(
          Number(lastOfMonth(month).slice(8, 10)),
        );
        expect(weekdayIndex(flat[0]!.date)).toBe(start);
      }
    }
  });
});

describe('visibleRange', () => {
  it('covers the borrowed days of a month, one week, or one day', () => {
    expect(visibleRange('month', '2026-11-10', 1)).toEqual({
      first: '2026-10-26',
      last: '2026-12-06',
    });
    expect(visibleRange('week', '2026-11-04', 0)).toEqual({
      first: '2026-11-01',
      last: '2026-11-07',
    });
    expect(visibleRange('day', '2026-11-04', 0)).toEqual({
      first: '2026-11-04',
      last: '2026-11-04',
    });
  });
});

describe('dayRange', () => {
  it('uses the zone of the user, not UTC', () => {
    expect(dayRange('America/Sao_Paulo', '2026-11-04', '2026-11-04')).toEqual({
      from: '2026-11-04T03:00:00.000Z',
      to: '2026-11-05T03:00:00.000Z',
    });
    expect(dayRange('Asia/Tokyo', '2026-11-04', '2026-11-04').from).toBe(
      '2026-11-03T15:00:00.000Z',
    );
  });

  it('spans several days', () => {
    const range = dayRange('America/Sao_Paulo', '2026-11-01', '2026-11-07');
    expect(hours(range)).toBe(7 * 24);
  });

  it('has a 25-hour day where the clocks go back', () => {
    // New York, 2026-11-01
    expect(hours(dayRange('America/New_York', '2026-11-01', '2026-11-01'))).toBe(25);
  });

  it('has a 23-hour day where the clocks go forward', () => {
    expect(hours(dayRange('America/New_York', '2026-03-08', '2026-03-08'))).toBe(23);
    expect(dayRange('America/New_York', '2026-03-08', '2026-03-08').to).toBe(
      '2026-03-09T04:00:00.000Z',
    );
  });

  it('starts a day late when the zone skips midnight', () => {
    // Sao Paulo moved to summer time at 00:00 on 2018-11-04, so the day began at 01:00.
    const range = dayRange('America/Sao_Paulo', '2018-11-04', '2018-11-04');
    expect(range.from).toBe('2018-11-04T03:00:00.000Z');
    expect(hours(range)).toBe(23);
  });

  it('chains days with no gap or overlap across a change', () => {
    const first = dayRange('America/New_York', '2026-11-01', '2026-11-01');
    const second = dayRange('America/New_York', '2026-11-02', '2026-11-02');
    expect(first.to).toBe(second.from);
  });
});
