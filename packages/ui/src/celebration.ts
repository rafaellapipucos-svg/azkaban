// Pure decisions behind the celebration components, kept apart from React Native so they can be tested.
import type { CelebrationKind } from '@azkaban/contracts';
import { confetti } from './tokens';
import type { MascotMood } from './Mascot';

/** `null` while the system has not answered whether it wants reduced motion. */
export type MotionPreference = boolean | null;

/** Confetti waits for the answer, skips straight to `onDone` with reduced motion, or plays. */
export function confettiPlan(reduced: MotionPreference): 'wait' | 'skip' | 'play' {
  if (reduced === null) return 'wait';
  return reduced ? 'skip' : 'play';
}

/** The mascot jumps when celebrating and sways when worried. Still with reduced motion. */
export function mascotMotion(mood: MascotMood, reduced: boolean): 'jump' | 'shake' | null {
  if (reduced) return null;
  if (mood === 'celebrating') return 'jump';
  if (mood === 'worried') return 'shake';
  return null;
}

/** A partial is honest work: a happy mascot, no confetti (ADR-0010, section 8). */
export function celebrationLook(kind: CelebrationKind): { mood: MascotMood; confetti: boolean } {
  return kind === 'occurrence_partial'
    ? { mood: 'happy', confetti: false }
    : { mood: 'celebrating', confetti: true };
}

export type ConfettiPiece = {
  /** Start, in % of the width. */
  left: number;
  /** Sideways drift at the end, in px. */
  drift: number;
  /** Share of the container height it starts above the top, so the burst is not a single row. */
  lead: number;
  /** Share of the container height it falls, so the pieces spread out. */
  fall: number;
  spin: number;
  color: string;
  round: boolean;
};

// ponytail: golden-ratio spread instead of Math.random, so every burst looks the same and tests are stable.
export function confettiPieces(count: number = confetti.pieces): ConfettiPiece[] {
  return Array.from({ length: count }, (_, i) => {
    const spread = (i * 0.618034) % 1;
    return {
      left: Math.round(spread * 96),
      drift: Math.round((spread - 0.5) * 80),
      lead: ((i * 3) % 7) / 20,
      fall: 0.7 + ((i * 7) % 5) * 0.1,
      spin: (i % 2 === 0 ? 1 : -1) * (180 + (i % 4) * 90),
      color: confetti.colors[i % confetti.colors.length] ?? confetti.colors[0],
      round: i % 3 === 0,
    };
  });
}
