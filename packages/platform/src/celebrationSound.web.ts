import type { Tone } from './celebrationSound';

let context: AudioContext | null = null;

export function canPlayTone(): boolean {
  return typeof AudioContext === 'function';
}

/** Browsers keep audio locked until a tap; a celebration follows one, and if not, it stays quiet. */
export function playTone({ notes, noteMs, volume }: Tone): void {
  if (!canPlayTone()) return;
  try {
    const audio = (context ??= new AudioContext());
    if (audio.state === 'suspended') void audio.resume().catch(() => undefined);
    const length = noteMs / 1000;
    notes.forEach((frequency, i) => {
      const at = audio.currentTime + i * length;
      const oscillator = audio.createOscillator();
      const gain = audio.createGain();
      oscillator.type = 'sine';
      oscillator.frequency.value = frequency;
      // Fades in and out, so the note does not click.
      gain.gain.setValueAtTime(0, at);
      gain.gain.linearRampToValueAtTime(volume, at + length * 0.1);
      gain.gain.linearRampToValueAtTime(0, at + length);
      oscillator.connect(gain).connect(audio.destination);
      oscillator.start(at);
      oscillator.stop(at + length);
    });
  } catch {
    // No audio device or a blocked context: the celebration is still on screen.
  }
}
