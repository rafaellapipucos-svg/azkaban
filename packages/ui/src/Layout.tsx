import type { ReactNode } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Mascot, type MascotMood } from './Mascot';
import { Body } from './Text';
import { contextColors, layout, spacing, type ContextColorToken } from './tokens';

export function Screen({ children }: { children: ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <ScrollView
      className="flex-1 bg-background dark:bg-background-dark"
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={{
        flexGrow: 1,
        width: '100%',
        maxWidth: layout.maxContentWidth,
        alignSelf: 'center',
        gap: spacing[4],
        paddingHorizontal: spacing[4],
        paddingTop: insets.top + spacing[6],
        paddingBottom: insets.bottom + spacing[6],
      }}
    >
      {children}
    </ScrollView>
  );
}

export function Card({ children, onPress }: { children: ReactNode; onPress?: () => void }) {
  const box =
    'min-h-11 gap-2 rounded-lg border-2 border-border bg-surface p-4 dark:border-border-dark dark:bg-surface-dark';
  return onPress ? (
    <Pressable role="button" onPress={onPress} className={`${box} active:opacity-70`}>
      {children}
    </Pressable>
  ) : (
    <View className={box}>{children}</View>
  );
}

export function Chip({
  label,
  selected,
  onPress,
  colorToken,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  colorToken?: string;
}) {
  const color = contextColors[colorToken as ContextColorToken];
  return (
    <Pressable
      role="radio"
      aria-checked={selected}
      aria-label={label}
      onPress={onPress}
      style={selected && color ? { backgroundColor: color, borderColor: color } : undefined}
      className={`min-h-11 flex-row items-center gap-1 rounded-full border-2 px-4 ${
        selected
          ? 'border-primary bg-primary'
          : 'border-border bg-surface dark:border-border-dark dark:bg-surface-dark'
      }`}
    >
      {selected ? (
        <Text aria-hidden className="font-heavy text-md text-onPrimary">
          ✓
        </Text>
      ) : null}
      <Text
        className={`font-heavy text-md ${selected ? 'text-onPrimary' : 'text-text dark:text-text-dark'}`}
      >
        {label}
      </Text>
    </Pressable>
  );
}

export function ChipRow({ children, label }: { children: ReactNode; label: string }) {
  return (
    <View role="radiogroup" aria-label={label} className="flex-row flex-wrap gap-2">
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
