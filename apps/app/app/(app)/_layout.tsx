import { useSession } from '@azkaban/feature-auth';
import { NotificationToaster } from '@azkaban/feature-notifications';
import { Redirect, Stack } from 'expo-router';
import { View } from 'react-native';
import { BackHeader } from '../../src/BackHeader';
import { env } from '../../src/env';

// A screen opened by address (reload, shared link, notification) starts with only itself in the
// stack. With the tabs underneath, it always has a screen to go back to.
export const unstable_settings = { anchor: '(tabs)' };

export default function AppLayout() {
  const { session, loading } = useSession();
  if (loading) return null;
  // Explicit: Stack.Protected would send visitors to the alphabetically first screen, sign-in.
  if (!session) return <Redirect href="/welcome" />;
  // The toaster sits over every signed-in screen, once, and listens to the bell.
  return (
    <View style={{ flex: 1 }}>
      <Stack screenOptions={{ header: () => <BackHeader /> }}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      </Stack>
      <NotificationToaster vapidPublicKey={env.EXPO_PUBLIC_VAPID_PUBLIC_KEY} />
    </View>
  );
}
