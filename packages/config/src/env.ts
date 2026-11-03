import { z } from 'zod';

const clientEnvSchema = z.object({
  EXPO_PUBLIC_APP_NAME: z.string().min(1),
  EXPO_PUBLIC_APP_SCHEME: z.string().regex(/^[a-z][a-z0-9+.-]*$/),
  EXPO_PUBLIC_SUPABASE_URL: z.url(),
  // Guards against pasting the secret key into a value that ships to the client.
  EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().startsWith('sb_publishable_'),
  // VAPID public key, an uncompressed P-256 point in base64url (ADR-0008). Without it the app works
  // and only Web Push is hidden. The private key never comes here: it is an Edge Function secret.
  // An empty line in .env counts as absent.
  EXPO_PUBLIC_VAPID_PUBLIC_KEY: z.preprocess(
    (value) => (value === '' ? undefined : value),
    z
      .string()
      .regex(/^B[A-Za-z0-9_-]{86}$/)
      .optional(),
  ),
});

export type ClientEnv = z.infer<typeof clientEnvSchema>;

type OptionalKey = 'EXPO_PUBLIC_VAPID_PUBLIC_KEY';

/** Every required key must be passed by name, so a missing static access fails the typecheck. */
export function parseClientEnv(
  values: Record<Exclude<keyof ClientEnv, OptionalKey>, string | undefined> &
    Partial<Record<OptionalKey, string | undefined>>,
): ClientEnv {
  return clientEnvSchema.parse(values);
}
