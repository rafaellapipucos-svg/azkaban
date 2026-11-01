import { describe, expect, it } from 'vitest';
import { formatDate, formatTime, parseDate, parseTime } from './dateTimeText';

describe('dateTimeText', () => {
  it('round-trips a date without shifting the day', () => {
    for (const value of ['2026-11-01', '2026-02-28', '2028-02-29', '2026-12-31', '2026-01-01']) {
      expect(formatDate(parseDate(value))).toBe(value);
    }
  });

  it('round-trips a time', () => {
    for (const value of ['00:00', '09:05', '12:30', '23:59']) {
      expect(formatTime(parseTime(value))).toBe(value);
    }
  });

  it('falls back to the given moment on empty or malformed input', () => {
    const now = new Date(2026, 10, 1, 8, 15);
    expect(parseDate('', now)).toBe(now);
    expect(parseDate('01/11/2026', now)).toBe(now);
    expect(parseTime('', now)).toBe(now);
    expect(parseTime('24:00', now)).toBe(now);
    expect(parseTime('9:5', now)).toBe(now);
  });

  it('pads single digits when formatting', () => {
    expect(formatDate(new Date(2026, 0, 5))).toBe('2026-01-05');
    expect(formatTime(new Date(2026, 0, 5, 7, 3))).toBe('07:03');
  });
});
