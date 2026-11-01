import type { OccurrenceStatus, ProofReviewStatus } from '@azkaban/contracts';
import { describe, expect, it } from 'vitest';
import { availableTransitions, canSendProof, canTransition } from './transitions';

// ADR-0007 section 9: how each actor passes a transition on a task that asks for a photo, and the
// dispute that only a reviewer undoes. The order of the checks is the RPC's: pair, actor, dispute,
// proof, reason, window.
const HOUR = 3_600_000;
const overdueAt = '2026-11-02T03:00:00.000Z';
const at = (offsetMs: number) => new Date(Date.parse(overdueAt) + offsetMs);

const request = (
  status: OccurrenceStatus,
  proofReviewStatus: ProofReviewStatus | null = null,
  overrides: Record<string, unknown> = {},
) => ({
  occurrence: { status, overdueAt, proofReviewStatus },
  actors: ['assignee' as const],
  requiresPartialReason: false,
  requiresPhotoProof: true,
  canReviewProof: false,
  lateCompletionWindowHours: 72,
  canManageGroup: false,
  now: at(-HOUR),
  ...overrides,
});

describe('a task that asks for a photo', () => {
  it.each([
    ['assignee', ['assignee']],
    ['editor', ['editor']],
    ['assignee and editor', ['assignee', 'editor']],
  ] as const)(
    'refuses done from %s with proof_required, from pending and from missed',
    (_, actors) => {
      for (const status of ['pending', 'missed'] as const) {
        expect(
          canTransition({ ...request(status, null, { actors }), to: 'done', reason: null }),
        ).toEqual({
          ok: false,
          error: 'proof_required',
        });
      }
    },
  );

  it('does not offer done as a button, and leaves the yellow and the red', () => {
    expect(availableTransitions(request('pending')).map(({ to }) => to)).toEqual([
      'partial',
      'missed',
    ]);
    expect(availableTransitions(request('missed')).map(({ to }) => to)).toEqual(['partial']);
  });

  it('takes the yellow without a photo', () => {
    expect(canTransition({ ...request('pending'), to: 'partial', reason: null })).toEqual({
      ok: true,
      late: false,
    });
  });

  it('still lets a done one be reopened', () => {
    expect(
      canTransition({ ...request('done', 'unreviewed'), to: 'pending', reason: null }),
    ).toEqual({ ok: true, late: false });
  });

  it('asks who may do it before it asks for the photo, and the photo before the late window', () => {
    expect(
      canTransition({ ...request('pending', null, { actors: [] }), to: 'done', reason: null }),
    ).toEqual({ ok: false, error: 'forbidden' });
    expect(
      canTransition({
        ...request('pending', null, { now: at(100 * HOUR) }),
        to: 'done',
        reason: null,
      }),
    ).toEqual({ ok: false, error: 'proof_required' });
  });

  it('is untouched without the flag', () => {
    const plain = request('pending', null, { requiresPhotoProof: false });
    expect(canTransition({ ...plain, to: 'done', reason: null })).toEqual({
      ok: true,
      late: false,
    });
    expect(availableTransitions(plain).map(({ to }) => to)).toEqual(['done', 'partial', 'missed']);
  });
});

describe('canSendProof', () => {
  it('is for the assignee of a pending or missed occurrence of a task with a photo', () => {
    expect(canSendProof(request('pending'))).toBe(true);
    expect(canSendProof(request('missed'))).toBe(true);
  });

  it('is not for an editor who is not the assignee: the server answers proof_required to them', () => {
    expect(canSendProof(request('pending', null, { actors: ['editor'] }))).toBe(false);
    expect(canSendProof(request('pending', null, { actors: ['editor', 'deleter'] }))).toBe(false);
    expect(canSendProof(request('pending', null, { actors: ['assignee', 'editor'] }))).toBe(true);
  });

  it('closes with the late window, except for who manages the group', () => {
    const late = { now: at(72 * HOUR + 1) };
    expect(canSendProof(request('pending', null, late))).toBe(false);
    expect(canSendProof(request('pending', null, { ...late, canManageGroup: true }))).toBe(true);
  });

  it('is false for a task with no photo, and where no green is reachable', () => {
    expect(canSendProof(request('pending', null, { requiresPhotoProof: false }))).toBe(false);
    for (const status of ['done', 'partial', 'cancelled'] as const) {
      expect(canSendProof(request(status))).toBe(false);
    }
  });

  it('is false while a dispute stands', () => {
    expect(canSendProof(request('missed', 'disputed'))).toBe(false);
  });
});

describe('a disputed occurrence', () => {
  const disputed = (status: 'partial' | 'missed', overrides = {}) =>
    request(status, 'disputed', { actors: ['assignee', 'editor'], ...overrides });

  it.each([
    ['partial', 'pending'],
    ['missed', 'pending'],
    ['missed', 'partial'],
  ] as const)('%s to %s answers proof_disputed unless the user can review it', (status, to) => {
    expect(canTransition({ ...disputed(status), to, reason: null })).toEqual({
      ok: false,
      error: 'proof_disputed',
    });
    expect(
      canTransition({ ...disputed(status, { canReviewProof: true }), to, reason: null }).ok,
    ).toBe(true);
  });

  it('offers nothing to the author and the owner of the task, and reopening to a reviewer', () => {
    expect(availableTransitions(disputed('partial'))).toEqual([]);
    expect(
      availableTransitions(disputed('partial', { canReviewProof: true })).map(({ to }) => to),
    ).toEqual(['pending']);
  });

  it('asks who may do it before it says the dispute stands', () => {
    expect(
      canTransition({ ...disputed('partial', { actors: [] }), to: 'pending', reason: null }),
    ).toEqual({ ok: false, error: 'forbidden' });
  });

  it('lets an approved or unreviewed proof be reopened as usual', () => {
    for (const review of ['approved', 'unreviewed', 'in_review'] as const) {
      expect(
        canTransition({
          ...request('done', review, { actors: ['assignee', 'editor'] }),
          to: 'pending',
          reason: null,
        }).ok,
      ).toBe(true);
    }
  });
});
