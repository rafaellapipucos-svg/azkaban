import { useColorScheme } from 'react-native';
import { colors } from './tokens';

/** Hex values for the places className cannot reach (SVG, native pickers, web inputs). */
export function useThemeColors() {
  const dark = useColorScheme() === 'dark';
  return {
    dark,
    background: dark ? colors['background-dark'] : colors.background,
    text: dark ? colors['text-dark'] : colors.text,
    muted: dark ? colors['muted-dark'] : colors.muted,
    surface: dark ? colors['surface-dark'] : colors.surface,
    border: dark ? colors['border-dark'] : colors.border,
    primary: dark ? colors['primary-light'] : colors.primary,
    danger: dark ? colors['danger-light'] : colors.danger,
  };
}
