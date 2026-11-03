import {
  occurrenceStatusSchema,
  occurrenceTransitions,
  type OccurrenceActor,
  type OccurrenceStatus,
} from '@azkaban/contracts';
import { describe, expect, it } from 'vitest';
import { availableTransitions, canTransition, findTransition, requiresReason } from './transitions';

const HOUR = 3_600_000;
const overdueAt = '2026-11-02T03:00:00.000Z';
const at = (offsetMs: number) => new Date(Date.parse(overdueAt) + offsetMs);

const base = {
  occurrence: { status: 'pending' as OccurrenceStatus, overdueAt },
  reason: null,
  requiresPartialReason: false,
  lateCompletionWindowHours: 72,
  canManageGroup: false,
  now: at(-HOUR),
};

const statuses = occurrenceStatusSchema.options;
const allActors: OccurrenceActor[] = ['assignee', 'editor', 'deleter', 'system'];
const inTable = (from: OccurrenceStatus, to: OccurrenceStatus) => findTransition(from, to);

describe('canTransition: every row of occurrenceTransitions', () => {
  const cases = occurrenceTransitions.flatMap(({ from, to, actors }) =>
    allActors.map((actor) => ({
      from,
      to,
      actor,
      allowed: (actors as readonly string[]).includes(actor),
    })),
  );

  it.each(cases)('$from -> $to by $actor: allowed=$allowed', ({ from, to, actor, allowed }) => {
    const result = canTransition({
      ...base,
      occurrence: { status: from, overdueAt },
      to,
      actors: [actor],
      // partial needs a reason only when the task asks for one
      reason: null,
    });
    expect(result.ok).toBe(allowed);
    if (!allowed) expect(result).toEqual({ ok: false, error: 'forbidden' });
  });

  it('allows a transition when any of the actors is listed', () => {
    const result = canTransition({
      ...base,
      to: 'cancelled',
      actors: ['assignee', 'deleter'],
    });
    expect(result.ok).toBe(true);
  });

  it('forbids a user with no actor at all', () => {
    expect(canTransition({ ...base, to: 'done', actors: [] })).toEqual({
      ok: false,
      error: 'forbidden',
    });
  });
});

describe('canTransition: pairs outside the table', () => {
  const pairs = statuses.flatMap((from) => statuses.map((to) => ({ from, to })));
  const outside = pairs.filter(({ from, to }) => !inTable(from, to));

  it('covers the 14 pairs the table leaves out, including staying in place', () => {
    expect(pairs).toHaveLength(25);
    expect(outside).toHaveLength(25 - occurrenceTransitions.length);
  });

  it.each(outside)('$from -> $to is invalid for every actor', ({ from, to }) => {
    expect(
      canTransition({ ...base, occurrence: { status: from, overdueAt }, to, actors: allActors }),
    ).toEqual({ ok: false, error: 'invalid_transition' });
  });

  it.each([
    ['done', 'partial'],
    ['partial', 'done'],
  ] as const)('%s and %s do not pass straight into each other (reopen first)', (from, to) => {
    expect(inTable(from, to)).toBeUndefined();
  });

  it('does not let the assignee reopen a missed occurrence', () => {
    expect(
      canTransition({
        ...base,
        occurrence: { status: 'missed', overdueAt },
        to: 'pending',
        actors: ['assignee'],
      }),
    ).toEqual({ ok: false, error: 'forbidden' });
  });
});

describe('canTransition: partial reason', () => {
  const partial = { ...base, to: 'partial' as const, actors: ['assignee' as const] };

  it.each([
    { requiresPartialReason: true, reason: null, ok: false },
    { requiresPartialReason: true, reason: '', ok: false },
    { requiresPartialReason: true, reason: '   ', ok: false },
    { requiresPartialReason: true, reason: 'ran out of time', ok: true },
    { requiresPartialReason: false, reason: null, ok: true },
  ])('requires=$requiresPartialReason reason=$reason -> ok=$ok', (input) => {
    const result = canTransition({ ...partial, ...input });
    expect(result.ok).toBe(input.ok);
    if (!result.ok) expect(result.error).toBe('reason_required');
  });

  it('asks for a reason only on partial', () => {
    expect(statuses.filter((to) => requiresReason(to, true))).toEqual(['partial']);
    expect(statuses.filter((to) => requiresReason(to, false))).toEqual([]);
  });

  it('checks the actor before the reason', () => {
    expect(
      canTransition({ ...partial, actors: [], requiresPartialReason: true, reason: null }),
    ).toEqual({ ok: false, error: 'forbidden' });
  });
});

describe('canTransition: late window', () => {
  const done = { ...base, to: 'done' as const, actors: ['assignee' as const] };
  const windowEnd = 72 * HOUR;

  it.each([
    { label: 'well before overdueAt', offset: -HOUR, ok: true, late: false },
    { label: 'one ms before overdueAt', offset: -1, ok: true, late: false },
    { label: 'exactly at overdueAt (still on time)', offset: 0, ok: true, late: false },
    { label: 'one ms after overdueAt', offset: 1, ok: true, late: true },
    { label: 'one ms before the window ends', offset: windowEnd - 1, ok: true, late: true },
    { label: 'exactly when the window ends (inclusive)', offset: windowEnd, ok: true, late: true },
    { label: 'one ms after the window ends', offset: windowEnd + 1, ok: false, late: false },
  ])('done $label', ({ offset, ok, late }) => {
    const result = canTransition({ ...done, now: at(offset) });
    expect(result.ok).toBe(ok);
    if (result.ok) expect(result.late).toBe(late);
    else expect(result.error).toBe('late_window_expired');
  });

  it('uses the window it is given, not a fixed 72 hours', () => {
    const now = at(25 * HOUR);
    expect(canTransition({ ...done, now, lateCompletionWindowHours: 24 }).ok).toBe(false);
    expect(canTransition({ ...done, now, lateCompletionWindowHours: 48 }).ok).toBe(true);
  });

  it('applies the same window to partial', () => {
    const partial = { ...done, to: 'partial' as const, now: at(windowEnd + 1) };
    expect(canTransition(partial)).toEqual({ ok: false, error: 'late_window_expired' });
    expect(canTransition({ ...partial, now: at(windowEnd) })).toEqual({ ok: true, late: true });
  });

  it('lets a missed occurrence be resolved inside the window, counted from overdueAt', () => {
    const missed = { ...done, occurrence: { status: 'missed' as const, overdueAt } };
    expect(canTransition({ ...missed, now: at(windowEnd) })).toEqual({ ok: true, late: true });
    expect(canTransition({ ...missed, now: at(windowEnd + 1) })).toEqual({
      ok: false,
      error: 'late_window_expired',
    });
  });

  it('has no window for task.manage_group, and late stays true', () => {
    const farAway = at(30 * 24 * HOUR);
    expect(canTransition({ ...done, canManageGroup: true, now: farAway })).toEqual({
      ok: true,
      late: true,
    });
  });

  it('does not limit marking as missed, reopening or cancelling after the window', () => {
    const now = at(windowEnd + HOUR);
    expect(canTransition({ ...base, to: 'missed', actors: ['assignee'], now }).ok).toBe(true);
    expect(
      canTransition({
        ...base,
        occurrence: { status: 'done', overdueAt },
        to: 'pending',
        actors: ['assignee'],
        now,
      }),
    ).toEqual({ ok: true, late: false });
    expect(canTransition({ ...base, to: 'cancelled', actors: ['deleter'], now }).ok).toBe(true);
  });

  it('is not late for transitions that do not resolve', () => {
    const now = at(HOUR);
    expect(canTransition({ ...base, to: 'missed', actors: ['assignee'], now })).toEqual({
      ok: true,
      late: false,
    });
  });
});

describe('availableTransitions', () => {
  const rules = {
    occurrence: { status: 'pending' as OccurrenceStatus, overdueAt },
    requiresPartialReason: true,
    lateCompletionWindowHours: 72,
    canManageGroup: false,
    now: at(-HOUR),
  };

  it('offers what the actor may do, flagging the reason', () => {
    expect(availableTransitions({ ...rules, actors: ['assignee'] })).toEqual([
      { to: 'done', requiresReason: false, late: false },
      { to: 'partial', requiresReason: true, late: false },
      { to: 'missed', requiresReason: false, late: false },
    ]);
  });

  it('offers cancel only to a deleter', () => {
    const deleter = availableTransitions({ ...rules, actors: ['deleter'] });
    expect(deleter.map((t) => t.to)).toEqual(['cancelled']);
  });

  it('hides done and partial once the window has expired', () => {
    const expired = availableTransitions({
      ...rules,
      actors: ['assignee'],
      now: at(73 * HOUR),
    });
    expect(expired.map((t) => t.to)).toEqual(['missed']);
  });

  it('shows done and partial past the window to task.manage_group, marked late', () => {
    const admin = availableTransitions({
      ...rules,
      actors: ['assignee', 'editor'],
      canManageGroup: true,
      now: at(100 * HOUR),
    });
    expect(admin.map((t) => [t.to, t.late])).toEqual([
      ['done', true],
      ['partial', true],
      ['missed', false],
    ]);
  });

  it('offers reopening a resolved occurrence', () => {
    expect(
      availableTransitions({
        ...rules,
        occurrence: { status: 'done', overdueAt },
        actors: ['assignee'],
      }),
    ).toEqual([{ to: 'pending', requiresReason: false, late: false }]);
  });

  it('offers nothing to someone with no actor', () => {
    expect(availableTransitions({ ...rules, actors: [] })).toEqual([]);
  });
});
