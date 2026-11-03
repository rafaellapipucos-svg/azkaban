import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, View } from 'react-native';
import { confettiPieces, confettiPlan } from './celebration';
import { motion, sizes } from './tokens';
import { useMotionPreference } from './useReducedMotion';

const pieces = confettiPieces();

/**
 * A short burst of confetti over its parent, which needs `position: relative` (the default) and
 * usually `overflow: hidden`. Decorative: hidden from screen readers, never catches a touch.
 * With reduced motion it draws nothing and calls `onDone` right away.
 */
export function Confetti({ onDone }: { onDone?: () => void }) {
  const plan = confettiPlan(useMotionPreference());
  const [height, setHeight] = useState(0);
  // Starts once measured; a later resize only rescales the fall.
  const measured = height > 0;
  const progress = useRef(new Animated.Value(0)).current;
  const done = useRef(onDone);
  useEffect(() => {
    done.current = onDone;
  }, [onDone]);

  useEffect(() => {
    if (plan === 'skip') done.current?.();
    if (plan !== 'play' || !measured) return;
    progress.setValue(0);
    const run = Animated.timing(progress, {
      toValue: 1,
      duration: motion.celebrate,
      easing: Easing.out(Easing.quad),
      useNativeDriver: false,
    });
    run.start(({ finished }) => finished && done.current?.());
    return () => run.stop();
  }, [plan, measured, progress]);

  if (plan !== 'play') return null;
  const piece = sizes.confettiPiece;
  return (
    <View
      aria-hidden
      onLayout={(event) => setHeight(event.nativeEvent.layout.height)}
      style={{
        position: 'absolute',
        top: 0,
        right: 0,
        bottom: 0,
        left: 0,
        overflow: 'hidden',
        pointerEvents: 'none',
      }}
    >
      {measured
        ? pieces.map((p, i) => (
            <Animated.View
              key={i}
              style={{
                position: 'absolute',
                top: -piece,
                left: `${p.left}%`,
                width: piece,
                height: p.round ? piece : piece * 1.6,
                borderRadius: p.round ? piece : 2,
                backgroundColor: p.color,
                opacity: progress.interpolate({ inputRange: [0, 0.8, 1], outputRange: [1, 1, 0] }),
                transform: [
                  {
                    translateY: progress.interpolate({
                      inputRange: [0, 1],
                      outputRange: [-height * p.lead, height * p.fall],
                    }),
                  },
                  {
                    translateX: progress.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0, p.drift],
                    }),
                  },
                  {
                    rotate: progress.interpolate({
                      inputRange: [0, 1],
                      outputRange: ['0deg', `${p.spin}deg`],
                    }),
                  },
                ],
              }}
            />
          ))
        : null}
    </View>
  );
}
