import { TextInput, type TextInputProps } from 'react-native';
import { sizes } from './tokens';
import { useThemeColors } from './useThemeColors';

/**
 * A bare text input in the app's look. The example text (placeholder) takes its color from the
 * active theme: a fixed token would be fine on the light surface and 2:1 on the dark one.
 * Prefer `FormTextField` for form fields; use this where react-hook-form is not involved.
 */
export function Input({
  invalid,
  className = '',
  ...props
}: TextInputProps & { invalid?: boolean }) {
  const { muted, text } = useThemeColors();
  return (
    <TextInput
      aria-invalid={invalid}
      placeholderTextColor={muted}
      // Inline: Tailwind's preflight greys an empty input (`input:placeholder-shown`) and would beat a class.
      style={{ minHeight: sizes.field, color: text }}
      className={`rounded-md border-2 bg-surface px-4 font-body text-md dark:bg-surface-dark ${
        invalid ? 'border-danger dark:border-danger-light' : 'border-border dark:border-border-dark'
      } ${className}`}
      {...props}
    />
  );
}
