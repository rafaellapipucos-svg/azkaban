import { describe, expect, it, vi } from 'vitest';
import { groupsRepository } from './index';

// What the invite RPCs answer; nothing reaches the network.
type Answer = { data?: unknown; error: unknown; status?: number };
const answer = vi.hoisted(() => ({
  rpc: { data: null, error: null } as Answer,
  insert: { error: null } as Answer,
}));
vi.mock('../client', () => ({
  db: () => ({
    rpc: () => Promise.resolve(answer.rpc),
    from: () => ({ insert: () => Promise.resolve(answer.insert) }),
  }),
}));

describe('acceptInvite', () => {
  it('returns the group joined', async () => {
    answer.rpc = { data: '10000000-0000-0000-0000-00000000000a', error: null };
    await expect(groupsRepository.acceptInvite('VALID22222')).resolves.toBe(
      '10000000-0000-0000-0000-00000000000a',
    );
  });

  it('throws invite_invalid when the code does not serve (null, SEG8-2)', async () => {
    answer.rpc = { data: null, error: null };
    await expect(groupsRepository.acceptInvite('NOPE000000')).rejects.toThrow('invite_invalid');
  });

  it('throws rate_limited over the limit (PT429)', async () => {
    const limited = { code: 'PT429', message: 'too many', hint: '120' };
    answer.rpc = { data: null, error: limited };
    const thrown = await groupsRepository
      .acceptInvite('GUESS00001')
      .catch((error: unknown) => error);
    expect(thrown).toBeInstanceOf(Error);
    expect(thrown).toMatchObject({ message: 'rate_limited', cause: limited });
  });
});

describe('previewInvite', () => {
  it('reads the group of the code, and null when it does not serve', async () => {
    const row = { group_name: 'Casa A', group_type: 'family', role: 'member' };
    answer.rpc = { data: [row], error: null };
    await expect(groupsRepository.previewInvite('VALID22222')).resolves.toEqual({
      groupName: 'Casa A',
      groupType: 'family',
      role: 'member',
    });
    answer.rpc = { data: [], error: null };
    await expect(groupsRepository.previewInvite('NOPE000000')).resolves.toBeNull();
  });

  it('throws rate_limited over the limit it shares with accept_invite (PT429)', async () => {
    const limited = { code: 'PT429', message: 'too many', hint: '120' };
    answer.rpc = { data: null, error: limited };
    const thrown = await groupsRepository
      .previewInvite('GUESS00001')
      .catch((error: unknown) => error);
    expect(thrown).toBeInstanceOf(Error);
    expect(thrown).toMatchObject({ message: 'rate_limited', cause: limited });
  });

  it('throws network when the fetch never reached the server, unavailable on 5xx', async () => {
    const offline = { code: '', message: 'TypeError: Failed to fetch' };
    answer.rpc = { data: null, error: offline, status: 0 };
    await expect(groupsRepository.previewInvite('VALID22222')).rejects.toMatchObject({
      message: 'network',
      cause: offline,
    });
    answer.rpc = { data: null, error: { code: '', message: 'Bad Gateway' }, status: 502 };
    await expect(groupsRepository.previewInvite('VALID22222')).rejects.toThrow('unavailable');
  });
});

describe('createInvite', () => {
  it('throws rate_limited over invite_create (the trigger raises PT429)', async () => {
    const limited = { code: 'PT429', message: 'rate_limited', hint: '3600' };
    answer.insert = { error: limited, status: 429 };
    await expect(
      groupsRepository.createInvite('10000000-0000-0000-0000-00000000000a', 'member', new Date()),
    ).rejects.toMatchObject({ message: 'rate_limited', cause: limited });
  });
});
