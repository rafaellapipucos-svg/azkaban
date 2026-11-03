import { useState } from 'react';
import { ActivityIndicator, Pressable, Text } from 'react-native';
import { buttonLook, type ButtonVariant } from './buttonLook';
import { colors, sizes } from './tokens';
import { useReducedMotion } from './useReducedMotion';

type Props = {
  label: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  disabled?: boolean;
  loading?: boolean;
};

// Its own component so only a loading button listens for reduced motion. With it, the ring stays
// still: the busy cue without the spin.
function Busy({ color }: { color: string }) {
  const reduced = useReducedMotion();
  return <ActivityIndicator animating={!reduced} hidesWhenStopped={false} color={color} />;
}

// The thick bottom border is the 3D edge; pressing removes it and sinks the button into its place.
export function Button({ label, onPress, variant = 'primary', disabled, loading }: Props) {
  const inactive = disabled || loading;
  const { box, label: labelStyle, dim } = buttonLook(variant, { disabled, loading });
  return (
    <Pressable
      role="button"
      aria-label={label}
      aria-busy={loading}
      aria-disabled={inactive}
      disabled={inactive}
      onPress={onPress}
      style={{ minHeight: sizes.field }}
      className={`items-center justify-center rounded-md border-b-4 px-6 py-3 active:translate-y-1 active:border-b-0 ${box} ${dim ? 'opacity-60' : ''}`}
    >
      {loading ? (
        <Busy color={variant === 'secondary' ? colors.primary : colors.onPrimary} />
      ) : (
        <Text className={`font-heavy text-md ${labelStyle}`}>{label}</Text>
      )}
    </Pressable>
  );
}

/**
 * Two-step press for destructive actions: Alert.alert does nothing on web. `disabled` blocks both
 * steps and drops a pending confirmation, so turning it back on starts again from the first step.
 */
export function ConfirmButton({
  label,
  confirmLabel,
  onConfirm,
  loading,
  disabled,
}: {
  label: string;
  confirmLabel: string;
  onConfirm: () => void;
  loading?: boolean;
  disabled?: boolean;
}) {
  const [armed, setArmed] = useState(false);
  // React's adjust-state-while-rendering pattern: no effect, no frame showing the armed label.
  if (disabled && armed) setArmed(false);
  return (
    <Button
      variant={armed ? 'danger' : 'secondary'}
      label={armed ? confirmLabel : label}
      loading={loading}
      disabled={disabled}
      onPress={armed ? onConfirm : () => setArmed(true)}
    />
  );
}
