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
