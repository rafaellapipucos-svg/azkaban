import { QueryClient } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { isTransientFailure } from '../offline';
import { occurrenceStatusAction, TaskError, taskErrorCode } from './index';

// What the RPC and the read of the status answer; nothing reaches the network.
const answer = vi.hoisted(() => ({
  rpc: [] as { data: unknown; error: unknown }[],
  status: null as string | null,
}));
vi.mock('../client', () => {
  const read: Record<string, unknown> = {};
  for (const step of ['from', 'select', 'eq']) read[step] = () => read;
  read.maybeSingle = () =>
    Promise.resolve({ data: answer.status && { status: answer.status }, error: null });
  return { db: () => ({ ...read, rpc: () => Promise.resolve(answer.rpc.shift()) }) };
});
vi.mock('@azkaban/platform', () => ({ storage: {} }));

const occurrenceId = '7c9e6679-7425-40de-944b-e07fc1f90ae7';
const tap = { occurrenceId, toStatus: 'done', expectedStatus: 'pending', reason: null } as const;
const conflict = { data: null, error: { code: 'P0001', message: 'status_conflict' } };
const row = {
  id: occurrenceId,
  task_id: occurrenceId,
  assignee_id: occurrenceId,
  scheduled_start: '2026-11-03T12:00:00Z',
  scheduled_due: '2026-11-03T13:00:00Z',
  overdue_at: '2026-11-03T13:00:00Z',
  status: 'done',
  late: false,
  status_reason: null,
  status_changed_at: '2026-11-03T12:30:00Z',
  status_changed_by: occurrenceId,
  proof_review_status: null,
};
const send = (input: unknown) =>
  occurrenceStatusAction.mutationFn(input as typeof tap, {
    client: new QueryClient(),
    meta: undefined,
  });

beforeEach(() => {
  answer.rpc = [];
  answer.status = null;
});

describe('marking a status through the queue', () => {
  it('sends the status seen at the tap', async () => {
    answer.rpc = [{ data: row, error: null }];
    await expect(send(tap)).resolves.toMatchObject({ status: 'done' });
  });

  it('counts a replay as done when the occurrence is already at the target', async () => {
    answer.rpc = [conflict];
    answer.status = 'done';
    await expect(send(tap)).resolves.toBeNull();
  });

  it('keeps the conflict when someone moved it elsewhere', async () => {
    answer.rpc = [conflict];
    answer.status = 'missed';
    const failure = await send(tap).catch((error: unknown) => error);
    expect(taskErrorCode(failure)).toBe('status_conflict');
    expect(isTransientFailure(failure)).toBe(false);
  });

  it('refuses variables that no longer match the contract', async () => {
    await expect(send({ ...tap, toStatus: 'finished' })).rejects.toThrow('invalid');
  });
});

describe('rate_limited', () => {
  it('is what PT429 means, and the queue does not try it again', () => {
    const limited = { code: 'PT429', message: 'rate_limited', hint: '120', details: null };
    expect(taskErrorCode(limited)).toBe('rate_limited');
    const wrapped = new TaskError(taskErrorCode(limited), { cause: limited });
    expect(taskErrorCode(wrapped)).toBe('rate_limited');
    expect(isTransientFailure(wrapped)).toBe(false);
  });
});
