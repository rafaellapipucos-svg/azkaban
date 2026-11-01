import { describe, expect, it } from 'vitest';
import { occurrenceTransitions } from './occurrence-transitions';
import { recurrenceInputSchema } from './recurrence';
import { occurrenceStatusSchema, taskBatchInputSchema, taskInputSchema } from './tasks';

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
