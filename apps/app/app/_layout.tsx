import '../global.css';
import { useSession } from '@azkaban/feature-auth';
import { stopPushWhenSignedOut } from '@azkaban/feature-notifications';
import {
  initData,
  offlineMutationDefaults,
  useClearCacheOnUserChange,
  useOfflineQueue,
} from '@azkaban/data';
import { initI18n } from '@azkaban/i18n';
import { useSystemColorScheme } from '@azkaban/ui';
import { Nunito_600SemiBold, Nunito_800ExtraBold, useFonts } from '@expo-google-fonts/nunito';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { env } from '../src/env';

initI18n();
initData(env.EXPO_PUBLIC_SUPABASE_URL, env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
// Before any screen: a session gone by any path also stops this browser's push.
stopPushWhenSignedOut();

// Outside the offline queue a change fails at once without a connection (ADR-0012, section 5).
const queryClient = new QueryClient({ defaultOptions: { mutations: offlineMutationDefaults } });

export default function RootLayout() {
  useSystemColorScheme();
  const { session, loading } = useSession();
  // Restores, saves and sends the signed-in user's offline queue (ADR-0012, section 5).
  useOfflineQueue(queryClient, session?.user.id ?? null);
  // Another account, or none, never sees the last one's cached data: the tree mounts again.
  const cacheGeneration = useClearCacheOnUserChange(queryClient, session?.user.id ?? null);
  const [fontsLoaded] = useFonts({ Nunito_600SemiBold, Nunito_800ExtraBold });
  if (!fontsLoaded || loading) return null;
  return (
    <QueryClientProvider client={queryClient}>
      <Stack key={cacheGeneration} screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(app)" />
        <Stack.Protected guard={!session}>
          <Stack.Screen name="welcome" />
          <Stack.Screen name="sign-in" />
          <Stack.Screen name="sign-up" />
        </Stack.Protected>
        <Stack.Screen name="join/[code]" />
        <Stack.Screen name="design-system" />
      </Stack>
    </QueryClientProvider>
  );
}
