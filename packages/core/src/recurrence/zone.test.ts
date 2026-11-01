import { describe, expect, it } from 'vitest';
import { instantOf, localDateOf, wallClockOf } from './zone';

const wall = (iso: string) => Date.parse(`${iso}Z`);
const iso = (ms: number) => new Date(ms).toISOString();
const NY = 'America/New_York';
const SP = 'America/Sao_Paulo';

describe('instantOf: wall clock to instant', () => {
  it.each([
    ['standard time', NY, '2026-01-15T09:00:00', '2026-01-15T14:00:00.000Z'],
    ['daylight time', NY, '2026-07-15T09:00:00', '2026-07-15T13:00:00.000Z'],
    ['Sao Paulo, no DST today', SP, '2026-01-15T09:00:00', '2026-01-15T12:00:00.000Z'],
    [
      'Sao Paulo in the year it still had DST',
      SP,
      '2018-01-15T09:00:00',
      '2018-01-15T11:00:00.000Z',
    ],
    ['half-hour offset', 'Asia/Kolkata', '2026-06-01T09:00:00', '2026-06-01T03:30:00.000Z'],
    ['UTC', 'UTC', '2026-06-01T09:00:00', '2026-06-01T09:00:00.000Z'],
    // Clocks go forward 02:00 -> 03:00: 02:30 never happens and moves forward by the gap.
    ['New York spring-forward gap', NY, '2026-03-08T02:30:00', '2026-03-08T07:30:00.000Z'],
    ['just before the gap', NY, '2026-03-08T01:59:59', '2026-03-08T06:59:59.000Z'],
    ['just after the gap', NY, '2026-03-08T03:00:00', '2026-03-08T07:00:00.000Z'],
    // Clocks go back 02:00 -> 01:00: 01:30 happens twice and resolves to the first.
    ['New York fall-back repeated hour', NY, '2026-11-01T01:30:00', '2026-11-01T05:30:00.000Z'],
    ['after the repeated hour', NY, '2026-11-01T02:30:00', '2026-11-01T07:30:00.000Z'],
    // Sao Paulo used to start DST at midnight, so 00:00 did not exist: 2018-11-04.
    ['Sao Paulo midnight gap (2018)', SP, '2018-11-04T00:00:00', '2018-11-04T03:00:00.000Z'],
  ])('%s', (_label, timezone, local, want) => {
    expect(iso(instantOf(timezone, wall(local)))).toBe(want);
  });
});

describe('wallClockOf: instant to wall clock', () => {
  it.each([
    [NY, '2026-03-08T06:59:59.000Z', '2026-03-08T01:59:59.000Z'],
    [NY, '2026-03-08T07:00:00.000Z', '2026-03-08T03:00:00.000Z'],
    [NY, '2026-11-01T05:59:59.000Z', '2026-11-01T01:59:59.000Z'],
    [NY, '2026-11-01T06:00:00.000Z', '2026-11-01T01:00:00.000Z'],
    [SP, '2026-11-02T02:00:00.000Z', '2026-11-01T23:00:00.000Z'],
    ['Asia/Kolkata', '2026-06-01T03:30:00.000Z', '2026-06-01T09:00:00.000Z'],
  ])('%s %s', (timezone, instant, want) => {
    expect(iso(wallClockOf(timezone, Date.parse(instant)))).toBe(want);
  });

  it('keeps the milliseconds', () => {
    expect(iso(wallClockOf(SP, Date.parse('2026-11-02T12:00:00.123Z')))).toBe(
      '2026-11-02T09:00:00.123Z',
    );
  });

  it('is the inverse of instantOf for times that exist once', () => {
    for (const timezone of [NY, SP, 'Asia/Kolkata', 'Europe/London']) {
      for (let day = 0; day < 365; day += 7) {
        const local = wall('2026-01-01T09:15:00') + day * 86_400_000;
        expect(wallClockOf(timezone, instantOf(timezone, local))).toBe(local);
      }
    }
  });
});

describe('localDateOf', () => {
  it.each([
    [SP, '2026-11-02T02:59:59.000Z', '2026-11-01'],
    [SP, '2026-11-02T03:00:00.000Z', '2026-11-02'],
    [NY, '2026-11-02T04:59:59.000Z', '2026-11-01'],
    [NY, '2026-11-02T05:00:00.000Z', '2026-11-02'],
  ])('%s %s -> %s', (timezone, instant, want) => {
    expect(localDateOf(timezone, Date.parse(instant))).toBe(want);
  });
});
