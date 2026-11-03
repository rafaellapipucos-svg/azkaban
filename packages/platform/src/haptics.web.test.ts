import { afterEach, describe, expect, it, vi } from 'vitest';
import { canVibrate, vibrate } from './haptics.web';

afterEach(() => vi.unstubAllGlobals());

describe('haptics (web)', () => {
  it('vibrates with a copy of the pattern where the browser can', () => {
    const calls: unknown[] = [];
    vi.stubGlobal('navigator', { vibrate: (p: unknown) => calls.push(p) });
    expect(canVibrate()).toBe(true);
    vibrate([20, 40, 20]);
    vibrate(30);
    expect(calls).toEqual([[20, 40, 20], 30]);
  });

  it('does nothing without navigator.vibrate, as in Safari on the iPhone', () => {
    vi.stubGlobal('navigator', {});
    expect(canVibrate()).toBe(false);
    expect(() => vibrate(30)).not.toThrow();
  });

  it('swallows a browser that refuses before the first tap', () => {
    vi.stubGlobal('navigator', {
      vibrate: () => {
        throw new Error('blocked');
      },
    });
    expect(() => vibrate(30)).not.toThrow();
  });
});
