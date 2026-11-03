import { useState } from 'react';
import { ActivityIndicator, Pressable, Text } from 'react-native';
import { colors, sizes } from './tokens';

export type ButtonVariant = 'primary' | 'secondary' | 'danger';

const variants: Record<ButtonVariant, { box: string; label: string }> = {
  primary: { box: 'bg-primary border-primaryEdge', label: 'text-onPrimary' },
  danger: { box: 'bg-danger border-dangerEdge', label: 'text-onPrimary' },
  secondary: {
    box: 'border-2 border-border bg-surface dark:border-border-dark dark:bg-surface-dark',
    label: 'text-primary dark:text-primary-light',
  },
};

type Props = {
  label: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  disabled?: boolean;
  loading?: boolean;
};

// The thick bottom border is the 3D edge; pressing removes it and sinks the button into its place.
export function Button({ label, onPress, variant = 'primary', disabled, loading }: Props) {
  const inactive = disabled || loading;
  const { box, label: labelStyle } = variants[variant];
  return (
    <Pressable
      role="button"
      aria-label={label}
      aria-busy={loading}
      aria-disabled={inactive}
      disabled={inactive}
      onPress={onPress}
      style={{ minHeight: sizes.field }}
      className={`items-center justify-center rounded-md border-b-4 px-6 py-3 active:translate-y-1 active:border-b-0 ${box} ${inactive ? 'opacity-60' : ''}`}
    >
      {loading ? (
        <ActivityIndicator color={variant === 'secondary' ? colors.primary : colors.onPrimary} />
      ) : (
        <Text className={`font-heavy text-md ${labelStyle}`}>{label}</Text>
      )}
    </Pressable>
  );
}

/** Two-step press for destructive actions: Alert.alert does nothing on web. */
export function ConfirmButton({
  label,
  confirmLabel,
  onConfirm,
  loading,
}: {
  label: string;
  confirmLabel: string;
  onConfirm: () => void;
  loading?: boolean;
}) {
  const [armed, setArmed] = useState(false);
  return (
    <Button
      variant={armed ? 'danger' : 'secondary'}
      label={armed ? confirmLabel : label}
      loading={loading}
      onPress={armed ? onConfirm : () => setArmed(true)}
    />
  );
}
