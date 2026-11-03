import { useTranslation } from '@azkaban/i18n';
import { Pressable, ScrollView, Text, View } from 'react-native';
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
 * them). A label that still does not fit wraps to a second line instead of an ellipsis. Six tabs need
 * 348 px at 14 px, so past five the labels drop to 12 px; the touch target stays 44 px. Narrower
 * than the tabs need (six at 200% zoom on a 375 px phone, 188 CSS px), the bar scrolls sideways
 * inside itself, so the page does not.
 */
export function TabBar({ items }: { items: readonly TabBarItem[] }) {
  const { t } = useTranslation('ui');
  // ponytail: one step down covers six tabs; a seventh would need a new answer (icons only, or scrolling).
  const labelSize = items.length > 5 ? 'text-xs' : 'text-sm';
  const insets = useSafeAreaInsets();
  return (
    <View
      role="navigation"
      aria-label={t('tabBar.label')}
      style={{ paddingBottom: insets.bottom }}
      className="border-t-2 border-border bg-surface dark:border-border-dark dark:bg-surface-dark"
    >
      <ScrollView horizontal contentContainerStyle={{ flexGrow: 1 }}>
        <View
          role="tablist"
          style={{ flexGrow: 1, minHeight: layout.tabBarHeight }}
          className="flex-row"
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
                className={`text-center font-heavy ${labelSize} ${
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
      </ScrollView>
    </View>
  );
}
