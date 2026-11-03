import { contextsRepository } from '@azkaban/data';
import { MaterializeStatus } from '@azkaban/feature-tasks';
import { useTranslation } from '@azkaban/i18n';
import { TabBar } from '@azkaban/ui';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { View } from 'react-native';

// The part of the tab navigator's props this bar reads, so the app needs no extra dependency.
type Props = {
  state: { index: number; routes: readonly { name: string; params?: object | undefined }[] };
};

type Tab = { id: string; label: string; icon: string; href: string; selected: boolean };

/**
 * Hoje, one tab per area, Calendário, Compras, then Perfil. The areas come from the database, and Expo Router tabs are
 * static, so the areas share one route, `area/[areaKey]`, and this bar draws a tab for each.
 */
export function AppTabBar({ state }: Props) {
  const { t } = useTranslation();
  const router = useRouter();
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
      id: 'shopping',
      label: t('tabs.shopping'),
      icon: '🛒',
      href: '/shopping',
      selected: current?.name === 'shopping',
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
      <TabBar
        items={tabs.map((tab) => ({
          key: tab.id,
          label: tab.label,
          icon: tab.icon,
          selected: tab.selected,
          onPress: () => router.navigate(tab.href),
        }))}
      />
    </View>
  );
}
