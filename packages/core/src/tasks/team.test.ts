import type { TeamOverviewRow } from '@azkaban/contracts';
import { describe, expect, it } from 'vitest';
import { dayTone, teamOverview, toneOf } from './team';

const bands = { green: 0.8, yellow: 0.5 };
const today = '2026-11-04';

const row = (
  userId: string,
  date: string,
  counts: Partial<TeamOverviewRow> = {},
): TeamOverviewRow => ({
  userId,
  displayName: userId,
  date,
  pending: 0,
  done: 0,
  partial: 0,
  missed: 0,
  late: 0,
  ...counts,
});
const member = (userId: string) => ({ userId, displayName: userId });
const overview = (rows: TeamOverviewRow[], members = [member('ana')]) =>
  teamOverview(rows, members, { today, bands });

describe('toneOf', () => {
  it('splits at the bands', () => {
    expect(toneOf(1, bands)).toBe('green');
    expect(toneOf(0.8, bands)).toBe('green');
    expect(toneOf(0.79, bands)).toBe('yellow');
    expect(toneOf(0.5, bands)).toBe('yellow');
    expect(toneOf(0.49, bands)).toBe('red');
    expect(toneOf(0, bands)).toBe('red');
    expect(toneOf(null, bands)).toBe('none');
  });
});

describe('dayTone', () => {
  it('is green only with everything done', () => {
    expect(dayTone({ pending: 0, done: 2, partial: 0, missed: 0, late: 0 })).toBe('green');
  });

  it('is red with a miss, yellow with a partial, and neutral while only pending', () => {
    expect(dayTone({ pending: 0, done: 2, partial: 1, missed: 1, late: 0 })).toBe('red');
    expect(dayTone({ pending: 1, done: 2, partial: 1, missed: 0, late: 0 })).toBe('yellow');
    expect(dayTone({ pending: 1, done: 2, partial: 0, missed: 0, late: 0 })).toBe('none');
    expect(dayTone({ pending: 0, done: 0, partial: 0, missed: 0, late: 0 })).toBe('none');
  });
});

describe('teamOverview', () => {
  it('lists members with no tasks, with no rate', () => {
    const [ana] = overview([]);
    expect(ana).toMatchObject({ userId: 'ana', rate: null, tone: 'none', due: 0 });
  });

  it('divides done by what was due', () => {
    const [ana] = overview([
      row('ana', '2026-11-02', { done: 3, partial: 1 }),
      row('ana', '2026-11-03', { done: 1, missed: 1 }),
    ]);
    expect(ana).toMatchObject({ done: 4, due: 6 });
    expect(ana!.rate).toBeCloseTo(4 / 6);
    expect(ana!.tone).toBe('yellow');
  });

  it('counts pending only on days before today', () => {
    const [ana] = overview([
      row('ana', '2026-11-03', { done: 1, pending: 1 }),
      row('ana', today, { done: 1, pending: 3 }),
    ]);
    // yesterday: 1 of 2; today: 1 done, pending ones are not late yet
    expect(ana).toMatchObject({ done: 2, due: 3 });
  });

  it('ignores days after today in the rate but keeps them in the days', () => {
    const [ana] = overview([row('ana', '2026-11-09', { pending: 5, done: 1 })]);
    expect(ana).toMatchObject({ due: 0, rate: null, tone: 'none' });
    expect(ana!.days.get('2026-11-09')?.pending).toBe(5);
  });

  it('is red when nothing was done', () => {
    const [ana] = overview([row('ana', '2026-11-02', { missed: 2, pending: 1 })]);
    expect(ana).toMatchObject({ rate: 0, tone: 'red' });
  });

  it('merges rows of the same day and orders members by name', () => {
    const result = overview(
      [row('zeca', '2026-11-02', { done: 1 }), row('zeca', '2026-11-02', { done: 1 })],
      [member('zeca'), member('beto')],
    );
    expect(result.map(({ userId }) => userId)).toEqual(['beto', 'zeca']);
    expect(result[1]!.days.get('2026-11-02')?.done).toBe(2);
  });

  it('keeps a person who has rows but left the list of members', () => {
    expect(overview([row('gone', '2026-11-02', { done: 1 })], [])).toHaveLength(1);
  });
});
