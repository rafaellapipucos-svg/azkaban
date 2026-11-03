import { describe, expect, it } from 'vitest';
import { parseClientEnv } from './env';
import { parseWhatsAppEnv } from './whatsapp-env';

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

describe('parseWhatsAppEnv', () => {
  const meta = {
    WHATSAPP_PROVIDER: 'meta',
    WHATSAPP_APP_SECRET: 'a'.repeat(32),
    WHATSAPP_VERIFY_TOKEN: 'v'.repeat(24),
    WHATSAPP_ACCESS_TOKEN: 't'.repeat(64),
    WHATSAPP_PHONE_NUMBER_ID: '106540352242922',
  };

  it('is the console with nothing set, so local and CI need no credentials', () => {
    expect(parseWhatsAppEnv({})).toEqual({ WHATSAPP_PROVIDER: 'console' });
    expect(parseWhatsAppEnv({ WHATSAPP_PROVIDER: '', WHATSAPP_APP_SECRET: '' })).toEqual({
      WHATSAPP_PROVIDER: 'console',
    });
  });

  it('takes a complete meta environment', () => {
    expect(parseWhatsAppEnv(meta)).toEqual(meta);
  });

  it.each(['WHATSAPP_ACCESS_TOKEN', 'WHATSAPP_PHONE_NUMBER_ID', 'WHATSAPP_APP_SECRET'] as const)(
    'refuses meta without %s',
    (key) => {
      expect(() => parseWhatsAppEnv({ ...meta, [key]: '' })).toThrow();
    },
  );

  it('refuses an unknown provider and a short secret', () => {
    expect(() => parseWhatsAppEnv({ WHATSAPP_PROVIDER: 'twilio' })).toThrow();
    expect(() => parseWhatsAppEnv({ WHATSAPP_APP_SECRET: 'short' })).toThrow();
  });

  // The .env.example values are public; only the local stack, with `console`, may use them.
  it.each(['WHATSAPP_APP_SECRET', 'WHATSAPP_VERIFY_TOKEN'] as const)(
    'refuses meta with the local demo %s',
    (key) => {
      expect(() => parseWhatsAppEnv({ ...meta, [key]: 'local-demo-whatsapp-secret' })).toThrow();
      expect(parseWhatsAppEnv({ [key]: 'local-demo-whatsapp-secret' })[key]).toBe(
        'local-demo-whatsapp-secret',
      );
    },
  );
});
