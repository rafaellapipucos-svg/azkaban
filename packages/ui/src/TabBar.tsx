import { useTranslation } from '@azkaban/i18n';
import { Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { layout, sizes, spacing } from './tokens';

export type TabBarItem = {
  key: string;
  label: string;
  /** An emoji. Hidden from screen readers: the label speaks for the tab. */
  icon: string;
  selected: boolean;
  onPress: () => void;
};

/**
 * The app's bottom bar, inside a `navigation` landmark. Each tab is as wide as its label and the
 * leftover width is shared, so "Calendário" and "Doméstico" fit whole at 320 px (equal fifths cut
 * them). A label that still does not fit wraps to a second line instead of an ellipsis.
 */
export function TabBar({ items }: { items: readonly TabBarItem[] }) {
  const { t } = useTranslation('ui');
  const insets = useSafeAreaInsets();
  return (
    <View role="navigation" aria-label={t('tabBar.label')}>
      <View
        role="tablist"
        style={{
          paddingBottom: insets.bottom,
          minHeight: layout.tabBarHeight + insets.bottom,
        }}
        className="flex-row border-t-2 border-border bg-surface dark:border-border-dark dark:bg-surface-dark"
      >
        {items.map((tab) => (
          <Pressable
            key={tab.key}
            role="tab"
            aria-selected={tab.selected}
            aria-label={tab.label}
            onPress={tab.onPress}
            style={{
              flexGrow: 1,
              flexShrink: 1,
              flexBasis: 'auto',
              minWidth: sizes.touch,
              minHeight: layout.tabBarHeight,
              gap: spacing[1],
            }}
            className={`items-center justify-center border-t-4 ${
              tab.selected ? 'border-primary dark:border-primary-light' : 'border-transparent'
            }`}
          >
            <Text aria-hidden className="text-lg">
              {tab.icon}
            </Text>
            <Text
              numberOfLines={2}
              className={`text-center font-heavy text-sm ${
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
