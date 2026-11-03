import { gamificationDefaults } from '@azkaban/config';
import { storage } from '@azkaban/platform';

/**
 * Sound and vibration of the celebrations, per device, never on the server (ADR-0010, sections 7
 * and 8). Defaults from `gamificationDefaults.celebration`.
 */
export type CelebrationPrefs = { sound: boolean; haptics: boolean };

const prefsKey = 'gamification.celebration';
// Per account on the device, so a shared tablet does not hide one person's level up from another.
const levelKey = (userId: string) => `gamification.celebratedLevel.${userId}`;

async function readJson(key: string): Promise<unknown> {
  try {
    const raw = await storage.getItem(key);
    return raw === null ? null : JSON.parse(raw);
  } catch {
    // Blocked storage or a value someone edited by hand: as if nothing was stored.
    return null;
  }
}

export async function readCelebrationPrefs(): Promise<CelebrationPrefs> {
  const stored = (await readJson(prefsKey)) as Partial<Record<keyof CelebrationPrefs, unknown>>;
  const pick = (key: keyof CelebrationPrefs) =>
    typeof stored?.[key] === 'boolean' ? stored[key] : gamificationDefaults.celebration[key];
  return { sound: pick('sound'), haptics: pick('haptics') };
}

export async function writeCelebrationPrefs(prefs: CelebrationPrefs): Promise<void> {
  await storage.setItem(prefsKey, JSON.stringify(prefs));
}

/** The highest level already celebrated on this device, or 0. */
export async function readCelebratedLevel(userId: string): Promise<number> {
  const stored = await readJson(levelKey(userId));
  return Number.isInteger(stored) && (stored as number) > 0 ? (stored as number) : 0;
}

/** Only ever goes up: a level celebrated once is not celebrated again after a reopen. */
export async function rememberCelebratedLevel(userId: string, level: number): Promise<number> {
  const highest = Math.max(await readCelebratedLevel(userId), level);
  try {
    await storage.setItem(levelKey(userId), JSON.stringify(highest));
  } catch {
    // Blocked storage: the celebration still shows, and a reopen may celebrate it again.
  }
  return highest;
}

/**
 * What plays with a celebration besides the screen. Reduced motion is not an input on purpose: the
 * ADR (section 8) takes away the confetti and the mascot's motion, which the ui components already do,
 * and leaves sound and vibration to their own switches.
 */
export function celebrationFeedback(
  prefs: CelebrationPrefs,
  device: { canPlayTone: boolean; canVibrate: boolean },
): { sound: boolean; haptics: boolean } {
  return { sound: prefs.sound && device.canPlayTone, haptics: prefs.haptics && device.canVibrate };
}
