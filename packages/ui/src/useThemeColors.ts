import { useColorScheme } from 'react-native';
import { colors } from './tokens';

/** Hex values for the places className cannot reach (SVG, native pickers, web inputs). */
export function useThemeColors() {
  const dark = useColorScheme() === 'dark';
  return {
    dark,
    text: dark ? colors['text-dark'] : colors.text,
    muted: dark ? colors['muted-dark'] : colors.muted,
    surface: dark ? colors['surface-dark'] : colors.surface,
    border: dark ? colors['border-dark'] : colors.border,
    primary: dark ? colors['primary-light'] : colors.primary,
  };
}
