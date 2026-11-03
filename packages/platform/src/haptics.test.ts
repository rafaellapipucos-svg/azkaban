import { afterEach, describe, expect, it, vi } from 'vitest';
import { canVibrate, vibrate } from './haptics';

const taps = vi.hoisted(() => [] as number[]);
vi.mock('expo-haptics', () => ({
  ImpactFeedbackStyle: { Medium: 'medium' },
  impactAsync: () => {
    taps.push(Date.now());
    return taps.length === 1 ? Promise.reject(new Error('no motor')) : Promise.resolve();
  },
}));

afterEach(() => vi.useRealTimers());

describe('haptics (native)', () => {
  it('taps once per "on" step, at the time it would start', () => {
    vi.useFakeTimers({ now: 0 });
    expect(canVibrate()).toBe(true);
    vibrate([30, 60, 30]);
    vi.advanceTimersByTime(200);
    expect(taps).toEqual([0, 90]);
    vibrate(30);
    vi.advanceTimersByTime(0);
    expect(taps).toHaveLength(3);
  });
});
