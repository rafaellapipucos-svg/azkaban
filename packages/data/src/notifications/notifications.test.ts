import { beforeEach, describe, expect, it, vi } from 'vitest';
import { notificationsRepository } from './index';

const rpc = vi.hoisted(() => vi.fn());
// A fake `from('profiles')`: each step records its call; `single` and `eq` after `update` resolve.
const profiles = vi.hoisted(() => ({
  select: vi.fn(),
  update: vi.fn(),
  eq: vi.fn(),
  single: vi.fn(),
}));
const from = vi.hoisted(() => vi.fn());
vi.mock('../client', () => ({ db: () => ({ rpc, from }), currentUserId: () => 'u1' }));

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

describe('push_hide_content', () => {
  beforeEach(() => {
    for (const step of Object.values(profiles)) step.mockReset();
    from.mockReset().mockReturnValue(profiles);
    profiles.select.mockReturnValue(profiles);
    profiles.update.mockReturnValue(profiles);
  });

  it("reads the user's own row", async () => {
    profiles.eq.mockReturnValue(profiles);
    profiles.single.mockResolvedValue({ data: { push_hide_content: true }, error: null });
    await expect(notificationsRepository.getPushHideContent()).resolves.toBe(true);
    expect(from).toHaveBeenCalledWith('profiles');
    expect(profiles.select).toHaveBeenCalledWith('push_hide_content');
    expect(profiles.eq).toHaveBeenCalledWith('id', 'u1');
  });

  it("writes only the column, on the user's own row", async () => {
    profiles.eq.mockResolvedValue({ error: null });
    await notificationsRepository.setPushHideContent(false);
    expect(profiles.update).toHaveBeenCalledWith({ push_hide_content: false });
    expect(profiles.eq).toHaveBeenCalledWith('id', 'u1');
  });

  it('throws what the database returns', async () => {
    const error = { message: 'permission denied' };
    profiles.eq.mockResolvedValue({ error });
    await expect(notificationsRepository.setPushHideContent(true)).rejects.toBe(error);
    profiles.eq.mockReturnValue(profiles);
    profiles.single.mockResolvedValue({ data: null, error });
    await expect(notificationsRepository.getPushHideContent()).rejects.toBe(error);
  });
});
