import { useSession } from '@azkaban/feature-auth';
import { useTranslation } from '@azkaban/i18n';
import { tokens } from '@azkaban/ui';
import { Redirect, Stack } from 'expo-router';
import { useColorScheme } from 'react-native';

export default function AppLayout() {
  const { t } = useTranslation();
  const dark = useColorScheme() === 'dark';
  const { session, loading } = useSession();
  if (loading) return null;
  // Explicit: Stack.Protected would send visitors to the alphabetically first screen, sign-in.
  if (!session) return <Redirect href="/welcome" />;
  return (
    <Stack
      screenOptions={{
        title: '',
        headerBackTitle: t('actions.back'),
        headerShadowVisible: false,
        headerStyle: {
          backgroundColor: dark ? tokens.colors['background-dark'] : tokens.colors.background,
        },
        headerTintColor: dark ? tokens.colors['primary-light'] : tokens.colors.primary,
      }}
    >
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
    </Stack>
  );
}
