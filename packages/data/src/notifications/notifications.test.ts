import { beforeEach, describe, expect, it, vi } from 'vitest';
import { notificationsRepository } from './index';

const rpc = vi.hoisted(() => vi.fn());
vi.mock('../client', () => ({ db: () => ({ rpc }), currentUserId: () => 'u1' }));

describe('registerNativeDevice', () => {
  beforeEach(() => {
    rpc.mockReset();
    rpc.mockResolvedValue({ data: 'd1', error: null });
  });

  it('registers the Expo token by the native RPC, a missing label as blank', async () => {
    await expect(
      notificationsRepository.registerNativeDevice({
        token: 'ExponentPushToken[abc123]',
        userAgent: null,
      }),
    ).resolves.toBe('d1');
    expect(rpc).toHaveBeenCalledWith('register_native_push_subscription', {
      p_token: 'ExponentPushToken[abc123]',
      p_user_agent: '',
    });
  });

  it('never sends a token outside the contract', async () => {
    for (const token of ['abc', 'ExponentPushToken[a b]', 'https://evil.example/']) {
      await expect(
        notificationsRepository.registerNativeDevice({ token, userAgent: 'Android' }),
      ).rejects.toThrow();
    }
    expect(rpc).not.toHaveBeenCalled();
  });

  it('throws what the RPC raises', async () => {
    const error = { message: 'invalid_push_subscription' };
    rpc.mockResolvedValue({ data: null, error });
    await expect(
      notificationsRepository.registerNativeDevice({
        token: 'ExpoPushToken[abc]',
        userAgent: 'iPhone',
      }),
    ).rejects.toBe(error);
  });
});
