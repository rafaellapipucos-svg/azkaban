import { useSession } from '@azkaban/feature-auth';
import { Redirect, Stack } from 'expo-router';
import { BackHeader } from '../../src/BackHeader';

// A screen opened by address (reload, shared link, notification) starts with only itself in the
// stack. With the tabs underneath, it always has a screen to go back to.
export const unstable_settings = { initialRouteName: '(tabs)' };

export default function AppLayout() {
  const { session, loading } = useSession();
  if (loading) return null;
  // Explicit: Stack.Protected would send visitors to the alphabetically first screen, sign-in.
  if (!session) return <Redirect href="/welcome" />;
  return (
    <Stack screenOptions={{ header: () => <BackHeader /> }}>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
    </Stack>
  );
}
