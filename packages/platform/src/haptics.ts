import { ImpactFeedbackStyle, impactAsync } from 'expo-haptics';

/**
 * A short vibration (ADR-0010, section 8). Native taps the Taptic Engine or the Android motor with
 * `expo-haptics`; the browser has its own, in `haptics.web.ts`. Whether to vibrate at all is the
 * caller's preference (gamification `prefs.haptics`), not this file's.
 */
export function canVibrate(): boolean {
  return true;
}

/**
 * Milliseconds, or on and off in turns. `expo-haptics` has no durations, so each "on" step becomes one
 * tap at the moment it would start.
 */
// ponytail: one tap per step, not a held buzz; Android's Vibration API if a long pattern ever matters.
export function vibrate(pattern: number | readonly number[]): void {
  const steps = typeof pattern === 'number' ? [pattern] : pattern;
  let at = 0;
  steps.forEach((ms, i) => {
    if (i % 2 === 0) setTimeout(tap, at);
    at += ms;
  });
}

function tap() {
  // A device without a motor rejects; a missed buzz is fine.
  impactAsync(ImpactFeedbackStyle.Medium).catch(() => undefined);
}
