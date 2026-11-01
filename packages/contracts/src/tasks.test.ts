import { describe, expect, it } from 'vitest';
import { contextInputSchema } from './contexts';
import { occurrenceTransitions } from './occurrence-transitions';
import { recurrenceInputSchema } from './recurrence';
import {
  occurrenceSchema,
  occurrenceStatusSchema,
  statusHistoryEntrySchema,
  taskBatchInputSchema,
  taskErrorCodeSchema,
  taskInputSchema,
} from './tasks';

const id = '11111111-1111-4111-8111-111111111111';
const timed = {
  title: 'Academia',
  notes: null,
  contextId: id,
  assigneeId: id,
  scheduleType: 'timed',
  startAt: '2026-11-02T12:00:00+00:00',
  dueAt: null,
  durationMin: 60,
  timezone: 'America/Sao_Paulo',
  reminders: [30, 0],
  requiresPhotoProof: false,
  requiresAdminApproval: false,
  requiresPartialReason: true,
  difficulty: 'easy',
  priority: 'normal',
  visibility: 'private',
  recurrence: null,
};
const deadline = { ...timed, scheduleType: 'deadline', durationMin: null, startAt: null };
const weekly = {
  frequency: 'weekly',
  interval: 2,
  weekdays: ['MO', 'WE'],
  monthDay: null,
  end: { type: 'never' },
};

describe('taskInputSchema', () => {
  it('accepts each schedule type', () => {
    expect(taskInputSchema.safeParse(timed).success).toBe(true);
    expect(
      taskInputSchema.safeParse({ ...timed, scheduleType: 'all_day', durationMin: null }).success,
    ).toBe(true);
    expect(taskInputSchema.safeParse({ ...deadline, dueAt: '2026-11-06T21:00:00Z' }).success).toBe(
      true,
    );
  });

  it('rejects schedule fields that do not fit the type', () => {
    expect(taskInputSchema.safeParse({ ...timed, startAt: null }).success).toBe(false);
    expect(taskInputSchema.safeParse({ ...timed, dueAt: timed.startAt }).success).toBe(false);
    expect(taskInputSchema.safeParse(deadline).success).toBe(false);
    expect(
      taskInputSchema.safeParse({ ...deadline, startAt: timed.startAt, dueAt: timed.startAt })
        .success,
    ).toBe(false);
  });

  it('keeps a private task out of batch creation', () => {
    const { assigneeId, ...task } = timed;
    const batch = { ...task, assigneeIds: [assigneeId] };
    expect(taskBatchInputSchema.safeParse({ ...batch, visibility: 'group' }).success).toBe(true);
    expect(taskBatchInputSchema.safeParse(batch).success).toBe(false);
  });
});

describe('taskErrorCodeSchema', () => {
  it('knows the codes the user can act on, and leaves the other database errors generic', () => {
    // A new task in an archived context (banco-de-dados, 23514): the person can pick another one.
    expect(taskErrorCodeSchema.safeParse('context_archived').success).toBe(true);
    // The app never writes these, so they stay out and get the generic text.
    expect(taskErrorCodeSchema.safeParse('invalid_rrule').success).toBe(false);
    expect(taskErrorCodeSchema.safeParse('invalid_timezone').success).toBe(false);
  });
});

// The fields of the proof are required from Phase 3 (ADR-0007): a repository that forgets to select
// them must fail here, not show a proof in review as plain green.
describe('the proof fields of an occurrence', () => {
  const occurrence = {
    id,
    taskId: id,
    assigneeId: id,
    scheduledStart: '2026-11-02T12:00:00Z',
    scheduledDue: '2026-11-02T12:00:00Z',
    overdueAt: '2026-11-03T03:00:00Z',
    status: 'done',
    late: false,
    statusReason: null,
    statusChangedAt: null,
    statusChangedBy: null,
    proofReviewStatus: 'in_review',
  };
  const entry = {
    id,
    occurrenceId: id,
    fromStatus: 'pending',
    toStatus: 'done',
    changedBy: id,
    changedAt: '2026-11-02T12:00:00Z',
    reason: null,
    proofReviewStatus: null,
  };

  it('requires the review status, null or not', () => {
    expect(occurrenceSchema.safeParse(occurrence).success).toBe(true);
    expect(occurrenceSchema.safeParse({ ...occurrence, proofReviewStatus: null }).success).toBe(
      true,
    );
    expect(
      occurrenceSchema.safeParse({ ...occurrence, proofReviewStatus: undefined }).success,
    ).toBe(false);
    expect(occurrenceSchema.safeParse({ ...occurrence, proofReviewStatus: 'maybe' }).success).toBe(
      false,
    );
  });

  it('requires it in the history too', () => {
    expect(statusHistoryEntrySchema.safeParse(entry).success).toBe(true);
    expect(
      statusHistoryEntrySchema.safeParse({ ...entry, proofReviewStatus: undefined }).success,
    ).toBe(false);
  });

  it('requires the place of a context to be said, even when there is none', () => {
    const context = { areaId: 'a', groupId: null, name: 'Casa', colorToken: 'x', icon: '🏠' };
    expect(contextInputSchema.safeParse({ ...context, location: null }).success).toBe(true);
    expect(contextInputSchema.safeParse(context).success).toBe(false);
    expect(
      contextInputSchema.safeParse({
        ...context,
        location: { address: 'Rua A', lat: -23.5, lng: -46.6, radiusM: 200 },
      }).success,
    ).toBe(true);
  });
});

describe('recurrenceInputSchema', () => {
  it('ties weekdays and monthDay to the frequency', () => {
    const monthly = { ...weekly, frequency: 'monthly', weekdays: [], monthDay: 5 };
    expect(recurrenceInputSchema.safeParse(weekly).success).toBe(true);
    expect(recurrenceInputSchema.safeParse(monthly).success).toBe(true);
    expect(recurrenceInputSchema.safeParse({ ...weekly, weekdays: [] }).success).toBe(false);
    expect(recurrenceInputSchema.safeParse({ ...weekly, frequency: 'daily' }).success).toBe(false);
    expect(recurrenceInputSchema.safeParse({ ...monthly, monthDay: null }).success).toBe(false);
  });
});

describe('occurrenceTransitions', () => {
  it('has one row per pair, with no self-transition', () => {
    const pairs = occurrenceTransitions.map(({ from, to }) => `${from}>${to}`);
    expect(new Set(pairs).size).toBe(pairs.length);
    expect(occurrenceTransitions.some(({ from, to }) => from === to)).toBe(false);
  });

  it('never leaves a status without a way back to pending', () => {
    const open = occurrenceStatusSchema.options.filter((status) => status !== 'pending');
    for (const status of open) {
      expect(occurrenceTransitions.some((t) => t.from === status && t.to === 'pending')).toBe(true);
    }
  });
});
