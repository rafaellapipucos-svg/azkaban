import { describe, expect, it, vi } from 'vitest';
import { groupsRepository } from './index';

// What `accept_invite` answers; nothing reaches the network.
const answer = vi.hoisted(() => ({ rpc: { data: null as unknown, error: null as unknown } }));
vi.mock('../client', () => ({ db: () => ({ rpc: () => Promise.resolve(answer.rpc) }) }));

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
