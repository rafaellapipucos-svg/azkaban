import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  celebrationFeedback,
  readCelebratedLevel,
  readCelebrationPrefs,
  rememberCelebratedLevel,
  writeCelebrationPrefs,
} from './preferences';

const { items, blocked } = vi.hoisted(() => ({
  items: new Map<string, string>(),
  blocked: { on: false },
}));

vi.mock('@azkaban/platform', () => ({
  storage: {
    getItem: async (key: string) => {
      if (blocked.on) throw new Error('blocked');
      return items.get(key) ?? null;
    },
    setItem: async (key: string, value: string) => {
      if (blocked.on) throw new Error('blocked');
      items.set(key, value);
    },
  },
}));

beforeEach(() => {
  items.clear();
  blocked.on = false;
});

describe('celebration preferences (ADR-0010 section 8)', () => {
  it('starts with sound off and vibration on', async () => {
    expect(await readCelebrationPrefs()).toEqual({ sound: false, haptics: true });
  });

  it('keeps what the person chose', async () => {
    await writeCelebrationPrefs({ sound: true, haptics: false });
    expect(await readCelebrationPrefs()).toEqual({ sound: true, haptics: false });
  });

  it.each([
    ['not json', '{'],
    ['wrong types', '{"sound":"yes","haptics":0}'],
    ['null', 'null'],
  ])('falls back to the defaults on %s', async (_name, raw) => {
    items.set('gamification.celebration', raw);
    expect(await readCelebrationPrefs()).toEqual({ sound: false, haptics: true });
  });

  it('falls back to the defaults when storage is blocked', async () => {
    blocked.on = true;
    expect(await readCelebrationPrefs()).toEqual({ sound: false, haptics: true });
  });

  it('keeps a partly valid value', async () => {
    items.set('gamification.celebration', '{"sound":true,"haptics":"x"}');
    expect(await readCelebrationPrefs()).toEqual({ sound: true, haptics: true });
  });
});

describe('celebrated level', () => {
  it('only goes up, and per account', async () => {
    expect(await readCelebratedLevel('ana')).toBe(0);
    expect(await rememberCelebratedLevel('ana', 4)).toBe(4);
    expect(await rememberCelebratedLevel('ana', 3)).toBe(4);
    expect(await readCelebratedLevel('ana')).toBe(4);
    expect(await readCelebratedLevel('bia')).toBe(0);
  });

  it('still answers when storage is blocked, so the celebration shows', async () => {
    blocked.on = true;
    expect(await rememberCelebratedLevel('ana', 3)).toBe(3);
  });

  it.each(['"4"', '-2', '2.5', '{'])('reads %s as nothing celebrated', async (raw) => {
    items.set('gamification.celebratedLevel.ana', raw);
    expect(await readCelebratedLevel('ana')).toBe(0);
  });
});

describe('celebrationFeedback', () => {
  const able = { canPlayTone: true, canVibrate: true };

  it('follows each switch on its own', () => {
    expect(celebrationFeedback({ sound: false, haptics: true }, able)).toEqual({
      sound: false,
      haptics: true,
    });
    expect(celebrationFeedback({ sound: true, haptics: false }, able)).toEqual({
      sound: true,
      haptics: false,
    });
  });

  it('stays quiet where the device cannot, whatever the switch says', () => {
    expect(
      celebrationFeedback(
        { sound: true, haptics: true },
        { canPlayTone: false, canVibrate: false },
      ),
    ).toEqual({ sound: false, haptics: false });
    // Safari on the iPhone: sound, no vibration.
    expect(
      celebrationFeedback({ sound: true, haptics: true }, { canPlayTone: true, canVibrate: false }),
    ).toEqual({ sound: true, haptics: false });
  });
});
