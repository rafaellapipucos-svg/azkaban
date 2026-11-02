import { describe, expect, it } from 'vitest';
import { isLate, isLateWindowOpen, isOverdue, isStillResolvable, lateWindowEnd } from './late';

const overdueAt = '2026-11-02T03:00:00.000Z';
const ms = Date.parse(overdueAt);

describe('isLate', () => {
  it.each([
    [-1, false],
    [0, false],
    [1, true],
  ])('now = overdueAt %i ms -> %s', (offset, want) => {
    expect(isLate(overdueAt, new Date(ms + offset))).toBe(want);
  });

  it('compares instants, not strings, so +00:00 and Z agree', () => {
    expect(isLate('2026-11-02T03:00:00+00:00', new Date(ms + 1))).toBe(true);
    expect(isLate('2026-11-02T00:00:00-03:00', new Date(ms))).toBe(false);
  });
});

describe('lateWindowEnd', () => {
  it('adds the window in hours to overdueAt', () => {
    expect(lateWindowEnd(overdueAt, 72).toISOString()).toBe('2026-11-05T03:00:00.000Z');
    expect(lateWindowEnd(overdueAt, 0).toISOString()).toBe(overdueAt);
  });
});

describe('isLateWindowOpen', () => {
  const end = lateWindowEnd(overdueAt, 72).getTime();
  it.each([
    [-1, true],
    [0, true],
    [1, false],
  ])('end %i ms -> %s', (offset, want) => {
    expect(isLateWindowOpen(overdueAt, 72, new Date(end + offset))).toBe(want);
  });
});

describe('isOverdue', () => {
  const now = new Date(ms + 1);
  it.each([
    ['pending', true],
    ['done', false],
    ['partial', false],
    ['missed', false],
    ['cancelled', false],
  ] as const)('%s past overdueAt -> %s', (status, want) => {
    expect(isOverdue({ status, overdueAt }, now)).toBe(want);
  });

  it('is not overdue on time', () => {
    expect(isOverdue({ status: 'pending', overdueAt }, new Date(ms))).toBe(false);
  });
});

describe('isStillResolvable', () => {
  const rules = { lateCompletionWindowHours: 72, canManageGroup: false };
  it.each([
    ['pending', false],
    ['done', false],
    ['partial', false],
    ['missed', true],
    ['cancelled', false],
  ] as const)('%s inside the window -> %s', (status, want) => {
    expect(isStillResolvable({ status, overdueAt }, new Date(ms + 1), rules)).toBe(want);
  });
});
