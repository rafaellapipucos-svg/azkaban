import { z } from 'zod';

const clientEnvSchema = z.object({
  EXPO_PUBLIC_APP_NAME: z.string().min(1),
  EXPO_PUBLIC_APP_SCHEME: z.string().regex(/^[a-z][a-z0-9+.-]*$/),
  EXPO_PUBLIC_SUPABASE_URL: z.url(),
  // Guards against pasting the secret key into a value that ships to the client.
  EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().startsWith('sb_publishable_'),
});

export type ClientEnv = z.infer<typeof clientEnvSchema>;

export function parseClientEnv(values: Record<keyof ClientEnv, string | undefined>): ClientEnv {
  return clientEnvSchema.parse(values);
}
