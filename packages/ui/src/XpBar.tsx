import { Text, View } from 'react-native';
import { useEased } from './ProgressRing';
import { radii, sizes } from './tokens';
import { useThemeColors } from './useThemeColors';

type Props = {
  /** Share of the current level done, 0 to 1. Values outside are clamped. */
  progress: number;
  /** Shown on the left and read as the name: "Nível 3". */
  label: string;
  /** Shown on the right and read as the value: "40 de 156 XP". */
  valueText: string;
};

/** Progress inside the current level. Eases like ProgressRing; jumps with reduced motion. */
export function XpBar({ progress, label, valueText }: Props) {
  const theme = useThemeColors();
  const clamped = Math.min(1, Math.max(0, progress));
  const eased = useEased(clamped);
  return (
    <View
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(clamped * 100)}
      aria-valuetext={valueText}
      className="gap-1"
    >
      <View className="flex-row flex-wrap justify-between gap-2">
        <Text role="none" className="font-heavy text-md text-text dark:text-text-dark">
          {label}
        </Text>
        <Text role="none" className="font-body text-sm text-muted dark:text-muted-dark">
          {valueText}
        </Text>
      </View>
      <View
        style={{
          height: sizes.xpBar,
          borderRadius: radii.full,
          backgroundColor: theme.border,
          overflow: 'hidden',
        }}
      >
        <View
          style={{
            width: `${eased * 100}%`,
            height: '100%',
            borderRadius: radii.full,
            backgroundColor: theme.primary,
          }}
        />
      </View>
    </View>
  );
}
