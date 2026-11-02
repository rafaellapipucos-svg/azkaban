import { describe, expect, it } from 'vitest';
import { parseClientEnv } from './env';

const valid = {
  EXPO_PUBLIC_APP_NAME: 'App',
  EXPO_PUBLIC_APP_SCHEME: 'app',
  EXPO_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
  EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_abc',
};

describe('parseClientEnv', () => {
  it('accepts a complete environment', () => {
    expect(parseClientEnv(valid)).toEqual(valid);
  });

  it('rejects a missing value', () => {
    expect(() => parseClientEnv({ ...valid, EXPO_PUBLIC_APP_NAME: undefined })).toThrow();
  });

  it('rejects a secret key', () => {
    expect(() =>
      parseClientEnv({ ...valid, EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_secret_abc' }),
    ).toThrow();
  });
});

describe('EXPO_PUBLIC_VAPID_PUBLIC_KEY', () => {
  const key = `B${'a'.repeat(86)}`;
  const vapid = (value: string) =>
    parseClientEnv({ ...valid, EXPO_PUBLIC_VAPID_PUBLIC_KEY: value }).EXPO_PUBLIC_VAPID_PUBLIC_KEY;

  it('is optional, and an empty value counts as absent', () => {
    expect(parseClientEnv(valid).EXPO_PUBLIC_VAPID_PUBLIC_KEY).toBeUndefined();
    expect(vapid('')).toBeUndefined();
    expect(vapid(key)).toBe(key);
  });

  // A VAPID private key is 43 characters: pasting it here must fail, never ship.
  it.each(['a'.repeat(43), `${key}=`, `A${'a'.repeat(86)}`])('refuses %s', (value) => {
    expect(() => vapid(value)).toThrow();
  });
});
