import { activateOnSpace } from '@azkaban/platform';
import { Pressable, Text, View } from 'react-native';
import { Body, Muted } from './Text';
import { sizes, spacing } from './tokens';

type Props = {
  label: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
  /** Second line under the label. */
  description?: string;
  disabled?: boolean;
};

// The whole row is the target. Position and the check in the thumb show the state, not only color.
export function SwitchRow({ label, value, onValueChange, description, disabled }: Props) {
  return (
    <Pressable
      role="switch"
      aria-label={label}
      aria-checked={value}
      aria-disabled={disabled}
      disabled={disabled}
      onPress={() => onValueChange(!value)}
      {...activateOnSpace(disabled ? undefined : () => onValueChange(!value))}
      style={{ minHeight: sizes.touch, gap: spacing[4] }}
      className={`flex-row items-center py-2 ${disabled ? 'opacity-60' : ''}`}
    >
      <View className="flex-1">
        <Body>{label}</Body>
        {description ? <Muted className="text-sm">{description}</Muted> : null}
      </View>
      <View
        style={{
          width: sizes.switchWidth,
          height: sizes.switchHeight,
          padding: (sizes.switchHeight - sizes.switchThumb) / 2,
        }}
        className={`rounded-full ${value ? 'items-end bg-primary' : 'items-start bg-pending dark:bg-pending-dark'}`}
      >
        <View
          style={{ width: sizes.switchThumb, height: sizes.switchThumb }}
          className="items-center justify-center rounded-full bg-surface"
        >
          {value ? (
            <Text aria-hidden className="font-heavy text-sm text-primary">
              ✓
            </Text>
          ) : null}
        </View>
      </View>
    </Pressable>
  );
}
