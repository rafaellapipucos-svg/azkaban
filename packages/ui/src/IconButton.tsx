import { Pressable, Text } from 'react-native';
import { sizes } from './tokens';

type Props = {
  /** An emoji or a single glyph. Hidden from screen readers: `label` speaks for it. */
  icon: string;
  label: string;
  onPress?: () => void;
  variant?: 'soft' | 'primary';
  disabled?: boolean;
};

const variants = {
  soft: {
    box: 'border-2 border-border bg-surface dark:border-border-dark dark:bg-surface-dark',
    icon: 'text-primary dark:text-primary-light',
  },
  primary: { box: 'border-b-4 border-primaryEdge bg-primary', icon: 'text-onPrimary' },
};

export function IconButton({ icon, label, onPress, variant = 'soft', disabled }: Props) {
  const { box, icon: iconStyle } = variants[variant];
  return (
    <Pressable
      role="button"
      aria-label={label}
      aria-disabled={disabled}
      disabled={disabled}
      onPress={onPress}
      style={{ minWidth: sizes.touch, minHeight: sizes.touch }}
      className={`items-center justify-center rounded-full active:opacity-70 ${box} ${disabled ? 'opacity-40' : ''}`}
    >
      <Text aria-hidden className={`font-heavy text-lg ${iconStyle}`}>
        {icon}
      </Text>
    </Pressable>
  );
}
