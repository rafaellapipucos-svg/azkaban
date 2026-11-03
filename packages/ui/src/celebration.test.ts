import { describe, expect, it } from 'vitest';
import { celebrationLook, confettiPieces, confettiPlan, mascotMotion } from './celebration';
import { confetti } from './tokens';

describe('confettiPlan', () => {
  it('waits until the system answers', () => expect(confettiPlan(null)).toBe('wait'));
  it('draws nothing with reduced motion', () => expect(confettiPlan(true)).toBe('skip'));
  it('plays otherwise', () => expect(confettiPlan(false)).toBe('play'));
});

describe('mascotMotion', () => {
  it('jumps when celebrating and sways when worried', () => {
    expect(mascotMotion('celebrating', false)).toBe('jump');
    expect(mascotMotion('worried', false)).toBe('shake');
  });
  it('keeps the calm moods still', () => {
    expect(mascotMotion('happy', false)).toBeNull();
    expect(mascotMotion('sleeping', false)).toBeNull();
  });
  it.each(['happy', 'celebrating', 'worried', 'sleeping'] as const)(
    'stays still with reduced motion: %s',
    (mood) => expect(mascotMotion(mood, true)).toBeNull(),
  );
});

describe('celebrationLook', () => {
  it('a partial gets a happy mascot and no confetti', () => {
    expect(celebrationLook('occurrence_partial')).toEqual({ mood: 'happy', confetti: false });
  });
  it.each([
    'occurrence_done',
    'level_up',
    'achievement',
    'streak_milestone',
    'perfect_day',
  ] as const)('%s celebrates with confetti', (kind) =>
    expect(celebrationLook(kind)).toEqual({ mood: 'celebrating', confetti: true }),
  );
});

describe('confettiPieces', () => {
  const pieces = confettiPieces();
  it('uses the token count and only palette colors', () => {
    expect(pieces).toHaveLength(confetti.pieces);
    for (const piece of pieces) expect(confetti.colors).toContain(piece.color);
  });
  it('stays inside the width and falls most of the height', () => {
    for (const piece of pieces) {
      expect(piece.left).toBeGreaterThanOrEqual(0);
      expect(piece.left).toBeLessThanOrEqual(96);
      expect(piece.fall).toBeGreaterThanOrEqual(0.7);
      expect(piece.fall).toBeLessThanOrEqual(1.1);
    }
  });
  it('is the same burst every time', () => expect(confettiPieces()).toEqual(pieces));
});
