import { contextsRepository } from '@azkaban/data';
import { MaterializeStatus } from '@azkaban/feature-tasks';
import { useTranslation } from '@azkaban/i18n';
import { tokens } from '@azkaban/ui';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// The part of the tab navigator's props this bar reads, so the app needs no extra dependency.
type Props = {
  state: { index: number; routes: readonly { name: string; params?: object | undefined }[] };
};

type Tab = { id: string; label: string; icon: string; href: string; selected: boolean };

/**
 * Hoje, one tab per area, Calendário, then Perfil. The areas come from the database, and Expo Router tabs are
 * static, so the areas share one route, `area/[areaKey]`, and this bar draws a tab for each.
 */
export function AppTabBar({ state }: Props) {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const areas = useQuery({ queryKey: ['areas'], queryFn: contextsRepository.listAreas });
  const current = state.routes[state.index];
  const activeArea = (current?.params as { areaKey?: string } | undefined)?.areaKey;

  const tabs: Tab[] = [
    {
      id: 'today',
      label: t('tabs.today'),
      icon: '🌱',
      href: '/',
      selected: current?.name === 'index',
    },
    ...(areas.data ?? []).map((area) => ({
      id: area.id,
      label: t(area.i18nKey, { ns: 'contexts' }),
      icon: area.icon,
      href: `/area/${area.key}`,
      selected: current?.name === 'area/[areaKey]' && activeArea === area.key,
    })),
    {
      id: 'calendar',
      label: t('tabs.calendar'),
      icon: '📅',
      href: '/calendar',
      selected: current?.name === 'calendar',
    },
    {
      id: 'profile',
      label: t('tabs.profile'),
      icon: '🙂',
      href: '/profile',
      selected: current?.name === 'profile',
    },
  ];

  return (
    <View>
      {/* On every tab: a repeating task saved a moment ago may still be creating its days. */}
      <MaterializeStatus />
      <View
        role="tablist"
        style={{
          paddingBottom: insets.bottom,
          minHeight: tokens.layout.tabBarHeight + insets.bottom,
        }}
        className="flex-row border-t-2 border-border bg-surface dark:border-border-dark dark:bg-surface-dark"
      >
        {tabs.map((tab) => (
          <Pressable
            key={tab.id}
            role="tab"
            aria-selected={tab.selected}
            aria-label={tab.label}
            onPress={() => router.navigate(tab.href)}
            style={{ minHeight: tokens.layout.tabBarHeight, gap: tokens.spacing[1] }}
            className={`flex-1 items-center justify-center border-t-4 ${
              tab.selected ? 'border-primary dark:border-primary-light' : 'border-transparent'
            }`}
          >
            <Text aria-hidden className="text-lg">
              {tab.icon}
            </Text>
            <Text
              numberOfLines={1}
              className={`font-heavy text-sm ${
                tab.selected
                  ? 'text-primary dark:text-primary-light'
                  : 'text-muted dark:text-muted-dark'
              }`}
            >
              {tab.label}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}
