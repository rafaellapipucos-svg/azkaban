import { Pressable, Text, View } from 'react-native';
import { sizes } from './tokens';

export type SegmentOption<T extends string> = { value: T; label: string };

type Props<T extends string> = {
  /** Names the group for screen readers: "Visão do calendário". */
  label: string;
  options: SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
};

// Same radio-group principle as ChipRow, for 2 to 4 short exclusive choices in one connected bar.
export function SegmentedControl<T extends string>({ label, options, value, onChange }: Props<T>) {
  return (
    <View
      role="radiogroup"
      aria-label={label}
      className="flex-row gap-1 rounded-full border-2 border-border bg-surface p-1 dark:border-border-dark dark:bg-surface-dark"
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            role="radio"
            aria-checked={selected}
            aria-label={option.label}
            onPress={() => onChange(option.value)}
            style={{ minHeight: sizes.touch }}
            className={`flex-1 flex-row items-center justify-center gap-1 rounded-full px-2 ${
              selected ? 'bg-primary' : 'active:opacity-70'
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
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
