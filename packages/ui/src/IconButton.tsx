import { Pressable, Text, View } from 'react-native';
import { sizes } from './tokens';

type Props = {
  /** An emoji or a single glyph. Hidden from screen readers: `label` speaks for it. */
  icon: string;
  label: string;
  onPress?: () => void;
  variant?: 'soft' | 'primary';
  disabled?: boolean;
  /**
   * A count on the corner, like unread items on the bell. Hidden when 0. It is not announced:
   * put the count in `label` too, e.g. "Notificações, 3 novas".
   */
  badge?: number;
};

const variants = {
  soft: {
    box: 'border-2 border-border bg-surface dark:border-border-dark dark:bg-surface-dark',
    icon: 'text-primary dark:text-primary-light',
  },
  primary: { box: 'border-b-4 border-primaryEdge bg-primary', icon: 'text-onPrimary' },
};

export function IconButton({ icon, label, onPress, variant = 'soft', disabled, badge }: Props) {
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
      {badge ? (
        // Red on light, light red with dark text on dark: tokens.test.ts measures both.
        <View
          aria-hidden
          style={{ minWidth: sizes.cornerBadge, height: sizes.cornerBadge }}
          className="absolute -right-1 -top-1 items-center justify-center rounded-full border-2 border-surface bg-danger px-1 dark:border-surface-dark dark:bg-danger-light"
        >
          <Text className="font-heavy text-sm text-onPrimary dark:text-text">
            {badge > 99 ? '99+' : badge}
          </Text>
        </View>
      ) : null}
    </Pressable>
  );
}
