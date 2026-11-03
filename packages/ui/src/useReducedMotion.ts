import { useEffect, useState } from 'react';
import { AccessibilityInfo, Platform } from 'react-native';
import type { MotionPreference } from './celebration';

/**
 * For animations of `transform` and `opacity` only (ADR-0012, section 10): on native they run on
 * the UI thread, so a busy JS thread does not drop frames. Web has no native driver.
 */
export const nativeDriver = Platform.OS !== 'web';

/** Whether the system asks for reduced motion, or `null` until it answers. */
export function useMotionPreference(): MotionPreference {
  const [reduced, setReduced] = useState<MotionPreference>(null);
  useEffect(() => {
    let alive = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((value) => alive && setReduced(value));
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduced);
    return () => {
      alive = false;
      subscription.remove();
    };
  }, []);
  return reduced;
}

/** True while the system asks for reduced motion. Assumed true until the system answers. */
export function useReducedMotion() {
  return useMotionPreference() ?? true;
}
