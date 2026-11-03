// `navigator.vibrate` exists on Android browsers; Safari on the iPhone has none.

export function canVibrate(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';
}

export function vibrate(pattern: number | readonly number[]): void {
  if (!canVibrate()) return;
  try {
    navigator.vibrate(typeof pattern === 'number' ? pattern : [...pattern]);
  } catch {
    // Some browsers refuse before the first tap on the page; a missed buzz is fine.
  }
}
