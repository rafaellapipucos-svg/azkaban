import { parseClientEnv } from '@azkaban/config';

// Expo inlines EXPO_PUBLIC_* only on static access, so each one is read by name.
export const env = parseClientEnv({
  EXPO_PUBLIC_APP_NAME: process.env.EXPO_PUBLIC_APP_NAME,
  EXPO_PUBLIC_APP_SCHEME: process.env.EXPO_PUBLIC_APP_SCHEME,
  EXPO_PUBLIC_SUPABASE_URL: process.env.EXPO_PUBLIC_SUPABASE_URL,
  EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  EXPO_PUBLIC_VAPID_PUBLIC_KEY: process.env.EXPO_PUBLIC_VAPID_PUBLIC_KEY,
});
