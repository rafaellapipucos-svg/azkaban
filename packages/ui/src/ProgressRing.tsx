import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { colors, motion, sizes } from './tokens';
import { useReducedMotion } from './useReducedMotion';
import { useThemeColors } from './useThemeColors';

type Props = {
  /** 0 to 1. Values outside are clamped. */
  progress: number;
  /** What the ring measures, read by screen readers: "Meta do dia". */
  label: string;
  /** Shown in the middle and read as the value: "3 de 5". */
  valueText: string;
  size?: number;
};

// Eases the number that drives the arc. Reduced motion jumps straight to the target.
// ponytail: the one animation that is not transform or opacity (ADR-0012, section 10): a paint of
// one SVG stroke, never layout, for `motion.base`. A rotating half-ring mask if a trace shows jank.
export function useEased(target: number) {
  const reduced = useReducedMotion();
  const animated = useRef(new Animated.Value(target)).current;
  const [current, setCurrent] = useState(target);
  useEffect(() => {
    const id = animated.addListener(({ value }) => setCurrent(value));
    return () => animated.removeListener(id);
  }, [animated]);
  useEffect(() => {
    if (reduced) {
      animated.setValue(target);
      return;
    }
    const run = Animated.timing(animated, {
      toValue: target,
      duration: motion.base,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    });
    run.start();
    return () => run.stop();
  }, [animated, target, reduced]);
  return current;
}

export function ProgressRing({ progress, label, valueText, size = sizes.ring }: Props) {
  const theme = useThemeColors();
  const clamped = Math.min(1, Math.max(0, progress));
  const eased = useEased(clamped);
  const stroke = sizes.ringStroke;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const middle = size / 2;
  return (
    <View
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(clamped * 100)}
      aria-valuetext={valueText}
      style={{ width: size, height: size }}
      className="items-center justify-center"
    >
      <Svg
        width={size}
        height={size}
        // Starts the arc at 12 o'clock. A style transform works on web and native; SVG `origin` does not.
        style={{ position: 'absolute', transform: [{ rotate: '-90deg' }] }}
        aria-hidden
      >
        <Circle
          cx={middle}
          cy={middle}
          r={radius}
          stroke={theme.border}
          strokeWidth={stroke}
          fill="none"
        />
        {eased > 0 ? (
          <Circle
            cx={middle}
            cy={middle}
            r={radius}
            stroke={clamped >= 1 ? colors.done : theme.primary}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={circumference * (1 - eased)}
            fill="none"
          />
        ) : null}
      </Svg>
      {/* Not a Subtitle: it would be a heading, and the ring already speaks the value. */}
      <Text role="none" className="text-center font-heavy text-lg text-text dark:text-text-dark">
        {valueText}
      </Text>
    </View>
  );
}
