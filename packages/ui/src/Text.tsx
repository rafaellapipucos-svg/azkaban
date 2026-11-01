import type { ComponentProps } from 'react';
import { Text } from 'react-native';

type Props = ComponentProps<typeof Text>;

export function Title({ className = '', ...props }: Props) {
  return (
    <Text
      role="heading"
      className={`font-heavy text-xl text-text dark:text-text-dark ${className}`}
      {...props}
    />
  );
}

/** `tone="danger"` swaps the color; className cannot, because the default text color would win. */
export function Subtitle({ className = '', tone, ...props }: Props & { tone?: 'danger' }) {
  const color =
    tone === 'danger' ? 'text-danger dark:text-danger-light' : 'text-text dark:text-text-dark';
  return <Text role="heading" className={`font-heavy text-lg ${color} ${className}`} {...props} />;
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
