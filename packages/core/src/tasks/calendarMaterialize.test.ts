import { describe, expect, it, vi } from 'vitest';
import { materializationNeed, materializeWithFollowUps } from './calendarMaterialize';

const SP = 'America/Sao_Paulo';
// 2026-11-04 10:00 in Sao Paulo
const now = new Date('2026-11-04T13:00:00.000Z');
const need = (lastDate: string) =>
  materializationNeed({ lastDate, timezone: SP, now, windowDays: 60, maxDays: 366 });

describe('materializationNeed', () => {
  it('asks for nothing inside the window the daily job keeps', () => {
    expect(need('2026-11-30').until).toBeNull();
    // today + 60 days is still covered
    expect(need('2027-01-03')).toMatchObject({ until: null, capped: false });
  });

  it('asks up to the end of the last visible day, in the zone of the user', () => {
    // 2027-01-04 is day 61; the end of that local day is 03:00Z the next day.
    expect(need('2027-01-04')).toMatchObject({
      until: '2027-01-05T03:00:00.000Z',
      capped: false,
    });
  });

  it('stops at today plus the most the function accepts', () => {
    // 2026-11-04 + 366 days
    expect(need('2027-11-05').limitDate).toBe('2027-11-05');
    expect(need('2027-11-05')).toMatchObject({ until: '2027-11-06T03:00:00.000Z', capped: false });
    expect(need('2027-11-06')).toMatchObject({ until: '2027-11-06T03:00:00.000Z', capped: true });
    // Far past it, the request does not grow
    expect(need('2030-01-01').until).toBe('2027-11-06T03:00:00.000Z');
    expect(need('2030-01-01').capped).toBe(true);
  });

  it('counts today in the zone of the user, not in UTC', () => {
    // 01:00Z on the 5th is still the 4th in Sao Paulo
    const late = new Date('2026-11-05T01:00:00.000Z');
    const result = materializationNeed({
      lastDate: '2027-01-04',
      timezone: SP,
      now: late,
      windowDays: 60,
      maxDays: 366,
    });
    expect(result.until).not.toBeNull();
    expect(
      materializationNeed({
        lastDate: '2027-01-04',
        timezone: 'Asia/Tokyo',
        now: late,
        windowDays: 60,
        maxDays: 366,
      }).until,
    ).toBeNull();
  });
});

describe('materializeWithFollowUps', () => {
  const answers = (...list: [number, number, number][]) => {
    const call = vi.fn(async () => {
      const [inserted, failed, deferred] = list[call.mock.calls.length - 1] ?? [0, 0, 0];
      return { inserted, failed, deferred };
    });
    return call;
  };

  it('calls once when nothing is deferred', async () => {
    const call = answers([3, 0, 0]);
    expect(await materializeWithFollowUps(call, 2)).toEqual({
      inserted: 3,
      failed: 0,
      deferred: 0,
    });
    expect(call).toHaveBeenCalledTimes(1);
  });

  it('calls again while deferred, and stops when it reaches zero', async () => {
    const call = answers([2, 0, 5], [4, 0, 0], [9, 9, 9]);
    expect(await materializeWithFollowUps(call, 2)).toEqual({
      inserted: 6,
      failed: 0,
      deferred: 0,
    });
    expect(call).toHaveBeenCalledTimes(2);
  });

  it('stops at the limit and leaves the last deferral to the daily job', async () => {
    const call = answers([1, 0, 5], [1, 0, 4], [1, 0, 3], [1, 0, 2]);
    expect(await materializeWithFollowUps(call, 2)).toEqual({
      inserted: 3,
      failed: 0,
      deferred: 3,
    });
    expect(call).toHaveBeenCalledTimes(3);
  });

  it('does not hide a failure that a later call left out', async () => {
    const call = answers([0, 2, 1], [1, 0, 0]);
    expect((await materializeWithFollowUps(call, 2)).failed).toBe(2);
  });
});
