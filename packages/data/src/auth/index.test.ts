import { defaults } from '@azkaban/config';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { saved, auth, platform } = vi.hoisted(() => ({
  saved: new Map<string, string>(),
  platform: { isWeb: false },
  auth: {
    getSession: vi.fn(),
    setSession: vi.fn(async () => ({ error: null })),
    signInWithOtp: vi.fn(async () => ({ error: null })),
  },
}));

vi.mock('@azkaban/platform', () => ({
  get isWeb() {
    return platform.isWeb;
  },
  createAppLink: (path: string) =>
    platform.isWeb ? `https://app.test${path}` : `azkaban://${path}`,
  storage: {
    getItem: async (key: string) => saved.get(key) ?? null,
    setItem: async (key: string, value: string) => void saved.set(key, value),
    removeItem: async (key: string) => void saved.delete(key),
  },
}));
vi.mock('../client', () => ({ db: () => ({ auth }) }));

const { authRepository, linkNotRequested, linkOtherAccount } = await import('./index');

declare const btoa: (data: string) => string;
const jwt = (sub: string) => `h.${btoa(JSON.stringify({ sub })).replace(/=+$/, '')}.s`;
const link = (sub: string, root = 'azkaban:///') =>
  `${root}tasks#access_token=${jwt(sub)}&refresh_token=r1`;
const signedInAs = (id: string | null) =>
  auth.getSession.mockResolvedValue({
    data: { session: id ? { user: { id } } : null },
    error: null,
  });
const requestLink = () => authRepository.sendMagicLink({ email: 'a@b.co' }, 'azkaban:///');

beforeEach(() => {
  vi.useFakeTimers();
  saved.clear();
  platform.isWeb = false;
  auth.setSession.mockClear();
  signedInAs(null);
});
afterEach(() => vi.useRealTimers());

describe('setSessionFromLink (BL23-2)', () => {
  it('never swaps an active session for another account, even after a request here', async () => {
    signedInAs('victim');
    await requestLink();
    expect(await authRepository.setSessionFromLink(link('attacker'))).toBe(linkOtherAccount);
    expect(auth.setSession).not.toHaveBeenCalled();
  });

  it('takes no session from a link this device did not ask for', async () => {
    expect(await authRepository.setSessionFromLink(link('attacker'))).toBe(linkNotRequested);
    expect(auth.setSession).not.toHaveBeenCalled();
  });

  it('takes no session once the request is older than the window', async () => {
    await requestLink();
    vi.advanceTimersByTime(defaults.sessionLinkRequestMaxAgeMs + 1);
    expect(await authRepository.setSessionFromLink(link('me'))).toBe(linkNotRequested);
    expect(auth.setSession).not.toHaveBeenCalled();
  });

  it('takes the session of a fresh request once, then spends it', async () => {
    await requestLink();
    vi.advanceTimersByTime(defaults.sessionLinkRequestMaxAgeMs);
    expect(await authRepository.setSessionFromLink(link('me'))).toBe('/tasks');
    expect(auth.setSession).toHaveBeenCalledWith({ access_token: jwt('me'), refresh_token: 'r1' });
    expect(saved.size).toBe(0);
    expect(await authRepository.setSessionFromLink(link('me'))).toBe(linkNotRequested);
    expect(auth.setSession).toHaveBeenCalledTimes(1);
  });

  it('refreshes the same account with a fresh request: the reauthentication link', async () => {
    signedInAs('me');
    expect(await authRepository.setSessionFromLink(link('me'))).toBe('/tasks');
    expect(auth.setSession).not.toHaveBeenCalled();
    await requestLink();
    expect(await authRepository.setSessionFromLink(link('me'))).toBe('/tasks');
    expect(auth.setSession).toHaveBeenCalledTimes(1);
  });
});

describe("setSessionFromLink on the web (BL-38, option A')", () => {
  const webLink = (sub: string) => link(sub, 'https://app.test/');
  beforeEach(() => {
    platform.isWeb = true;
  });

  it('takes the session with none active, with no request marker', async () => {
    expect(await authRepository.setSessionFromLink(webLink('me'))).toBe('/tasks');
    expect(auth.setSession).toHaveBeenCalledWith({ access_token: jwt('me'), refresh_token: 'r1' });
  });

  it('takes the session of the same account: the reauthentication link', async () => {
    signedInAs('me');
    expect(await authRepository.setSessionFromLink(webLink('me'))).toBe('/tasks');
    expect(auth.setSession).toHaveBeenCalledTimes(1);
  });

  it('never swaps an active session for another account', async () => {
    signedInAs('victim');
    expect(await authRepository.setSessionFromLink(webLink('attacker'))).toBe(linkOtherAccount);
    expect(auth.setSession).not.toHaveBeenCalled();
  });
});
