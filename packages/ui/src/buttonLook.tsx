// .tsx although it has no JSX: Tailwind only scans .tsx files for class names (apps/app/tailwind.config.ts).
export type ButtonVariant = 'primary' | 'secondary' | 'danger';

export type ButtonLook = { box: string; label: string; dim: boolean };

const variants: Record<ButtonVariant, { box: string; label: string }> = {
  primary: { box: 'bg-primary border-primaryEdge', label: 'text-onPrimary' },
  danger: { box: 'bg-danger border-dangerEdge', label: 'text-onPrimary' },
  secondary: {
    box: 'border-2 border-border bg-surface dark:border-border-dark dark:bg-surface-dark',
    label: 'text-primary dark:text-primary-light',
  },
};

// Off draws in tokens instead of fading: `muted` on `surface` is a pair tokens.test.ts measures,
// where opacity-60 left white on primary near 3:1. The dashed border is the cue beyond color.
const off = {
  box: 'border-2 border-dashed border-border bg-surface dark:border-border-dark dark:bg-surface-dark',
  label: 'text-muted dark:text-muted-dark',
};

/** Loading keeps the variant, dimmed under the spinner; disabled alone takes the off look. */
export function buttonLook(
  variant: ButtonVariant,
  { disabled, loading }: { disabled?: boolean; loading?: boolean },
): ButtonLook {
  if (loading) return { ...variants[variant], dim: true };
  return { ...(disabled ? off : variants[variant]), dim: false };
}
