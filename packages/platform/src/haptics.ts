/**
 * A short vibration (ADR-0010, section 8). The browser does it, in `haptics.web.ts`; native gets
 * `expo-haptics` in F8-7 with the native build, so until then nothing vibrates here.
 */
export function canVibrate(): boolean {
  return false;
}

/** Milliseconds, or on and off in turns. Does nothing where the device cannot vibrate. */
export function vibrate(pattern: number | readonly number[]): void {
  void pattern;
}
