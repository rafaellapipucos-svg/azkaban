import { useTranslation } from '@azkaban/i18n';
import { useEffect, useRef } from 'react';
import { Animated, Easing } from 'react-native';
import Svg, { Circle, Ellipse, G, Path } from 'react-native-svg';
import { mascotMotion } from './celebration';
import { mascotColors as c, motion, sizes } from './tokens';
import { useReducedMotion } from './useReducedMotion';

export type MascotMood = 'happy' | 'celebrating' | 'worried' | 'sleeping';

const mouths: Record<MascotMood, string> = {
  happy: 'M50 70 Q60 80 70 70',
  celebrating: 'M46 66 Q60 88 74 66 Z',
  worried: 'M50 76 Q60 68 70 76',
  sleeping: 'M54 74 Q60 77 66 74',
};

// Two hops for `celebrating`, a sway for `worried`; the same 0..1 value drives both.
const steps = [0, 0.25, 0.5, 0.75, 1];
const jump = [0, -sizes.mascotJump, 0, -sizes.mascotJump / 2, 0];
const shake = [0, -sizes.mascotShake, sizes.mascotShake, -sizes.mascotShake, 0];

// Broto: an original sprout-headed seedling, because the app is about things growing day by day.
export function Mascot({
  mood = 'happy',
  size = sizes.mascot,
  animate = false,
}: {
  mood?: MascotMood;
  size?: number;
  /** Plays a short move once, when shown and when the mood changes. Never with reduced motion. */
  animate?: boolean;
}) {
  const { t } = useTranslation();
  const reduced = useReducedMotion();
  const move = animate ? mascotMotion(mood, reduced) : null;
  const value = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!move) return;
    value.setValue(0);
    const run = Animated.timing(value, {
      toValue: 1,
      duration: motion.mascot,
      easing: Easing.inOut(Easing.quad),
      useNativeDriver: false,
    });
    run.start();
    return () => run.stop();
  }, [move, value]);
  const closedEyes = mood === 'sleeping';
  const offset = value.interpolate({
    inputRange: steps,
    outputRange: move === 'shake' ? shake : jump,
  });
  return (
    <Animated.View
      style={{
        transform:
          move === 'shake' ? [{ translateX: offset }] : [{ translateY: move ? offset : 0 }],
      }}
    >
      <Svg
        width={size}
        height={size}
        viewBox="0 0 120 120"
        role="img"
        aria-label={t(`mascot.${mood}`)}
      >
        <Path d="M60 26 Q58 12 44 8 Q44 24 60 26 Z" fill={c.leaf} />
        <Path d="M60 26 Q62 14 78 12 Q76 26 60 26 Z" fill={c.leaf} />
        <Ellipse cx="60" cy="68" rx="42" ry="44" fill={c.body} />
        <Ellipse cx="60" cy="84" rx="26" ry="24" fill={c.belly} />
        {closedEyes ? (
          <G stroke={c.ink} strokeWidth="4" strokeLinecap="round" fill="none">
            <Path d="M36 56 Q42 62 48 56" />
            <Path d="M72 56 Q78 62 84 56" />
          </G>
        ) : (
          <G>
            <Circle cx="42" cy="56" r="11" fill="#FFFFFF" />
            <Circle cx="78" cy="56" r="11" fill="#FFFFFF" />
            <Circle cx="44" cy={mood === 'worried' ? 60 : 56} r="6" fill={c.ink} />
            <Circle cx="80" cy={mood === 'worried' ? 60 : 56} r="6" fill={c.ink} />
          </G>
        )}
        <Circle cx="28" cy="70" r="6" fill={c.blush} opacity={0.7} />
        <Circle cx="92" cy="70" r="6" fill={c.blush} opacity={0.7} />
        <Path
          d={mouths[mood]}
          stroke={c.ink}
          strokeWidth="4"
          strokeLinecap="round"
          fill={mood === 'celebrating' ? c.ink : 'none'}
        />
      </Svg>
    </Animated.View>
  );
}
