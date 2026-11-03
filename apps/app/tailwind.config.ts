import type { Config } from 'tailwindcss';
import { colors, fontFamily, fontSize, radii, spacing } from '../../packages/ui/src/tokens';

const toPixels = (scale: Record<string, number>) =>
  Object.fromEntries(Object.entries(scale).map(([key, value]) => [key, `${value}px`]));

export default {
  // 'media' throws on web in NativeWind 4.2; useSystemColorScheme keeps the class in sync.
  darkMode: 'class',
  content: ['./app/**/*.tsx', '../../packages/**/src/**/*.tsx'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors,
      fontFamily: { body: [fontFamily.body], heavy: [fontFamily.heavy] },
      fontSize: toPixels(fontSize),
      borderRadius: toPixels(radii),
      spacing: toPixels(spacing),
    },
  },
} satisfies Config;
