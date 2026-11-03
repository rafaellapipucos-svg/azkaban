import { useTranslation } from '@azkaban/i18n';
import { useEffect, useRef } from 'react';
import { Animated, Easing } from 'react-native';
import Svg, { Circle, Ellipse, G, Path } from 'react-native-svg';
import { mascotMotion } from './celebration';
import { mascotBox, mascotShapes as shape } from './mascotArt';
import { mascotColors as c, motion, sizes } from './tokens';
import { nativeDriver, useReducedMotion } from './useReducedMotion';

export type MascotMood = keyof typeof shape.mouths;

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
      useNativeDriver: nativeDriver,
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
        viewBox={`0 0 ${mascotBox} ${mascotBox}`}
        role="img"
        aria-label={t(`mascot.${mood}`)}
      >
        {shape.leaves.map((d) => (
          <Path key={d} d={d} fill={c.leaf} />
        ))}
        <Ellipse {...shape.body} fill={c.body} />
        <Ellipse {...shape.belly} fill={c.belly} />
        {closedEyes ? (
          <G stroke={c.ink} strokeWidth={shape.stroke} strokeLinecap="round" fill="none">
            {shape.closedEyes.map((d) => (
              <Path key={d} d={d} />
            ))}
          </G>
        ) : (
          <G>
            {shape.eyes.x.map((x) => (
              <G key={x}>
                <Circle cx={x} cy={shape.eyes.y} r={shape.eyes.r} fill={c.eye} />
                <Circle
                  cx={x + 2}
                  cy={shape.eyes.y + (mood === 'worried' ? 4 : 0)}
                  r={shape.eyes.pupil}
                  fill={c.ink}
                />
              </G>
            ))}
          </G>
        )}
        {shape.blush.x.map((x) => (
          <Circle
            key={x}
            cx={x}
            cy={shape.blush.y}
            r={shape.blush.r}
            fill={c.blush}
            opacity={shape.blush.opacity}
          />
        ))}
        <Path
          d={shape.mouths[mood]}
          stroke={c.ink}
          strokeWidth={shape.stroke}
          strokeLinecap="round"
          fill={mood === 'celebrating' ? c.ink : 'none'}
        />
      </Svg>
    </Animated.View>
  );
}
