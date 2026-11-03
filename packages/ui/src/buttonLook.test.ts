import { describe, expect, it } from 'vitest';
import { buttonLook } from './buttonLook';

const variants = ['primary', 'secondary', 'danger'] as const;

describe('buttonLook', () => {
  it.each(variants)('%s, disabled: muted on surface, dashed, not faded', (variant) => {
    const look = buttonLook(variant, { disabled: true });
    expect(look.dim).toBe(false);
    expect(look.label).toBe('text-muted dark:text-muted-dark');
    expect(look.box).toContain('border-dashed');
    expect(look.box).toContain('bg-surface');
    expect(look.box).toContain('dark:bg-surface-dark');
  });

  it.each(variants)('%s, loading: keeps the variant, dimmed, even when disabled', (variant) => {
    const look = buttonLook(variant, { loading: true, disabled: true });
    expect(look).toEqual({ ...buttonLook(variant, {}), dim: true });
  });

  it('enabled keeps each variant apart from the off look', () => {
    const off = buttonLook('primary', { disabled: true });
    for (const variant of variants) expect(buttonLook(variant, {}).box).not.toBe(off.box);
  });
});
