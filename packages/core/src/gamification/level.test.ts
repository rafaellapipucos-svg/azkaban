import { describe, expect, it } from 'vitest';
import { levelForXp, type LevelCurve } from './level';

// Same numbers as gamificationDefaults.level in config, which core does not import.
const curve: LevelCurve = { firstLevelXp: 100, growth: 1.25 };

describe('levelForXp (ADR-0010 section 1)', () => {
  it('starts at level 1 with nothing', () => {
    expect(levelForXp(0, curve)).toEqual({ level: 1, xpIntoLevel: 0, xpForNextLevel: 100 });
  });

  it('moves up exactly at each step, never a point before', () => {
    expect(levelForXp(99, curve)).toEqual({ level: 1, xpIntoLevel: 99, xpForNextLevel: 100 });
    expect(levelForXp(100, curve)).toEqual({ level: 2, xpIntoLevel: 0, xpForNextLevel: 125 });
    expect(levelForXp(224, curve).level).toBe(2);
    // 100 + 125, then round(156.25) = 156.
    expect(levelForXp(225, curve)).toEqual({ level: 3, xpIntoLevel: 0, xpForNextLevel: 156 });
  });

  it('rounds each step on its own: level 10 starts at 2579', () => {
    // 100 125 156 195 244 305 381 477 596. The ADR rounds the whole sum, 2580.23, to 2580.
    expect(levelForXp(2578, curve).level).toBe(9);
    expect(levelForXp(2579, curve)).toEqual({ level: 10, xpIntoLevel: 0, xpForNextLevel: 745 });
  });

  it('follows the curve it is given', () => {
    expect(levelForXp(250, { firstLevelXp: 50, growth: 1 })).toMatchObject({
      level: 6,
      xpIntoLevel: 0,
    });
  });

  it('treats a negative total as nothing', () => {
    expect(levelForXp(-30, curve)).toEqual({ level: 1, xpIntoLevel: 0, xpForNextLevel: 100 });
  });

  it('refuses a curve that would never end', () => {
    expect(() => levelForXp(10, { firstLevelXp: 0, growth: 1.25 })).toThrow(RangeError);
    expect(() => levelForXp(10, { firstLevelXp: 100, growth: 0.5 })).toThrow(RangeError);
  });
});
