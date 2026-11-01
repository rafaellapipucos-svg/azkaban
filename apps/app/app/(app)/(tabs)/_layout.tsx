import { useTranslation } from '@azkaban/i18n';
import { tokens } from '@azkaban/ui';
import { Tabs } from 'expo-router';
import { useColorScheme } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { tabIcon } from '../../../src/tabIcon';

export default function TabsLayout() {
  const { t } = useTranslation();
  const dark = useColorScheme() === 'dark';
  const insets = useSafeAreaInsets();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: dark ? tokens.colors['primary-light'] : tokens.colors.primary,
        tabBarInactiveTintColor: dark ? tokens.colors['muted-dark'] : tokens.colors.muted,
        tabBarStyle: {
          height: tokens.layout.tabBarHeight + insets.bottom,
          paddingBottom: insets.bottom + tokens.spacing[2],
          backgroundColor: dark ? tokens.colors['surface-dark'] : tokens.colors.surface,
          borderTopColor: dark ? tokens.colors['border-dark'] : tokens.colors.border,
        },
        tabBarLabelStyle: { fontFamily: tokens.fontFamily.heavy },
      }}
    >
      <Tabs.Screen name="index" options={{ title: t('tabs.areas'), tabBarIcon: tabIcon('🌱') }} />
      <Tabs.Screen name="groups" options={{ title: t('tabs.groups'), tabBarIcon: tabIcon('👥') }} />
      <Tabs.Screen
        name="profile"
        options={{ title: t('tabs.profile'), tabBarIcon: tabIcon('🙂') }}
      />
    </Tabs>
  );
}
