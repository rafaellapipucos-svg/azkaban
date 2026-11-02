import type { ReactNode } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { activateOnSpace } from '@azkaban/platform';
import { Mascot, type MascotMood } from './Mascot';
import { Body } from './Text';
import { contextColors, layout, sizes, spacing, type ContextColorToken } from './tokens';
import { useThemeColors } from './useThemeColors';

// SafeAreaView pads only the part of the safe area it actually overlaps: full under the status bar
// on a tab or welcome screen, nothing under a stack header that already clears it. useSafeAreaInsets
// cannot tell, and used to add the status bar height on top of the header.
// The content is the page's `main` landmark (ADR-0008, section 13): one Screen per route, and the
// stack hides the screens underneath with display: none, so a page has a single main.
export function Screen({
  children,
}: {
  children: ReactNode;
  /** Name of the screen for the browser tab: "<title> · <app>". Without it, the app name. */
  title?: string;
}) {
  // pending F4-9: useDocumentTitle(title) from @azkaban/platform, created by notificacoes-whatsapp.
  const { background } = useThemeColors();
  return (
    <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1, backgroundColor: background }}>
      <ScrollView
        role="main"
        className="flex-1"
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          flexGrow: 1,
          width: '100%',
          maxWidth: layout.maxContentWidth,
          alignSelf: 'center',
          gap: spacing[4],
          paddingHorizontal: spacing[4],
          paddingVertical: spacing[6],
        }}
      >
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}

export function Card({ children, onPress }: { children: ReactNode; onPress?: () => void }) {
  const box =
    'gap-2 rounded-lg border-2 border-border bg-surface p-4 dark:border-border-dark dark:bg-surface-dark';
  return onPress ? (
    <Pressable
      role="button"
      onPress={onPress}
      style={{ minHeight: sizes.touch }}
      className={`${box} active:opacity-70`}
    >
      {children}
    </Pressable>
  ) : (
    <View style={{ minHeight: sizes.touch }} className={box}>
      {children}
    </View>
  );
}

export function Chip({
  label,
  selected,
  onPress,
  colorToken,
  multiple,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  colorToken?: string;
  /** Several chips of the row can be selected at once: announced as a checkbox, not a radio. */
  multiple?: boolean;
}) {
  const color = contextColors[colorToken as ContextColorToken];
  return (
    <Pressable
      role={multiple ? 'checkbox' : 'radio'}
      aria-checked={selected}
      aria-label={label}
      onPress={onPress}
      {...activateOnSpace(onPress)}
      style={[
        { minHeight: sizes.touch },
        selected && color ? { backgroundColor: color, borderColor: color } : null,
      ]}
      // max-w-full + shrink: a long name wraps inside the row instead of widening it.
      className={`max-w-full flex-row items-center gap-1 rounded-full border-2 px-4 py-2 ${
        selected
          ? 'border-primary bg-primary'
          : 'border-border bg-surface dark:border-border-dark dark:bg-surface-dark'
      }`}
    >
      {selected ? (
        <Text aria-hidden className="shrink-0 font-heavy text-md text-onPrimary">
          ✓
        </Text>
      ) : null}
      <Text
        className={`shrink font-heavy text-md ${selected ? 'text-onPrimary' : 'text-text dark:text-text-dark'}`}
      >
        {label}
      </Text>
    </Pressable>
  );
}

export function ChipRow({
  children,
  label,
  multiple,
}: {
  children: ReactNode;
  label: string;
  /** Pass the same flag to the chips inside. */
  multiple?: boolean;
}) {
  return (
    <View
      role={multiple ? 'group' : 'radiogroup'}
      aria-label={label}
      className="flex-row flex-wrap gap-2"
    >
      {children}
    </View>
  );
}

export function EmptyState({
  text,
  mood = 'sleeping',
  children,
}: {
  text: string;
  mood?: MascotMood;
  children?: ReactNode;
}) {
  return (
    <View className="items-center gap-4 py-8">
      <Mascot mood={mood} />
      <Body className="text-center">{text}</Body>
      {children}
    </View>
  );
}
