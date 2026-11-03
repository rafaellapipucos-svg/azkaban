/**
 * A short generated tone for a celebration (ADR-0010, section 8): Web Audio in
 * `celebrationSound.web.ts`, no file and no license. Native plays nothing until F8-7.
 */
export type Tone = {
  /** Hz of each note, played one after the other. */
  notes: readonly number[];
  noteMs: number;
  /** Peak gain, 0 to 1. */
  volume: number;
};

export function canPlayTone(): boolean {
  return false;
}

export function playTone(tone: Tone): void {
  void tone;
}
