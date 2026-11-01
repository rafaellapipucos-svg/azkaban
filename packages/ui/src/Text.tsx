import type { ComponentProps } from 'react';
import { Text } from 'react-native';

type Props = ComponentProps<typeof Text>;

/** The screen's one heading: level 1. */
export function Title({ className = '', ...props }: Props) {
  return (
    <Text
      role="heading"
      aria-level={1}
      className={`font-heavy text-xl text-text dark:text-text-dark ${className}`}
      {...props}
    />
  );
}

/**
 * A section heading: level 2 by default, `level={3}` for one nested under another. `tone="danger"`
 * swaps the color; className cannot, because the default text color would win.
 */
export function Subtitle({
  className = '',
  tone,
  level = 2,
  ...props
}: Props & { tone?: 'danger'; level?: 2 | 3 }) {
  const color =
    tone === 'danger' ? 'text-danger dark:text-danger-light' : 'text-text dark:text-text-dark';
  return (
    <Text
      role="heading"
      aria-level={level}
      className={`font-heavy text-lg ${color} ${className}`}
      {...props}
    />
  );
}

export function Body({ className = '', ...props }: Props) {
  return (
    <Text className={`font-body text-md text-text dark:text-text-dark ${className}`} {...props} />
  );
}

export function Muted({ className = '', ...props }: Props) {
  return (
    <Text className={`font-body text-md text-muted dark:text-muted-dark ${className}`} {...props} />
  );
}

export function ErrorText({ className = '', ...props }: Props) {
  return (
    <Text
      role="alert"
      className={`font-body text-sm text-danger dark:text-danger-light ${className}`}
      {...props}
    />
  );
}
