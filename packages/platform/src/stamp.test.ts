import { describe, expect, it } from 'vitest';
import { ellipsize, layoutStamp, stampLines, stampMetrics } from './stamp';

const width = (text: string) => Array.from(text).length * 10; // 10 px per character

describe('stampLines', () => {
  it('writes the device date and time in the given zone, then the task and the user', () => {
    const lines = stampLines({
      capturedAt: new Date('2026-11-01T20:45:12Z'),
      taskTitle: '  Academia ',
      userName: 'Duda',
      locale: 'pt-BR',
      timeZone: 'America/Sao_Paulo',
    });
    expect(lines).toHaveLength(3);
    expect(lines[0]).toContain('01/11/2026');
    expect(lines[0]).toContain('17:45:12');
    expect(lines.slice(1)).toEqual(['Academia', 'Duda']);
  });

  it('moves the clock with the zone', () => {
    const when = new Date('2026-11-01T20:45:12Z');
    const at = (timeZone: string) =>
      stampLines({ capturedAt: when, taskTitle: 't', userName: 'u', locale: 'pt-BR', timeZone })[0];
    expect(at('UTC')).toContain('20:45:12');
    expect(at('Asia/Tokyo')).toContain('05:45:12');
  });
});

describe('stampMetrics', () => {
  it('follows the short edge inside a floor and a ceiling', () => {
    expect(stampMetrics(1600, 1200).fontSize).toBe(38);
    expect(stampMetrics(600, 450).fontSize).toBe(14);
    expect(stampMetrics(2048, 2048).fontSize).toBe(40);
    expect(stampMetrics(320, 320).fontSize).toBe(12);
  });
});

describe('ellipsize', () => {
  it('leaves a text that fits and cuts one that does not', () => {
    expect(ellipsize('abc', 100, width)).toBe('abc');
    const cut = ellipsize('abcdefghij', 55, width);
    expect(cut).toBe('abcd…');
    expect(width(cut)).toBeLessThanOrEqual(55);
  });

  it('does not split an emoji', () => {
    expect(ellipsize('a😀b😀c', 45, width)).toBe('a😀b…');
  });
});

describe('layoutStamp', () => {
  it('puts a band at the bottom edge with a line per row inside it', () => {
    const { fontSize, band, lines } = layoutStamp(1600, 1200, ['a', 'b', 'c'], width);
    const m = stampMetrics(1600, 1200);
    expect(fontSize).toBe(m.fontSize);
    expect(band.y + band.height).toBe(1200);
    expect(band.height).toBe(3 * m.lineHeight + 2 * m.padding);
    expect(lines.map((l) => l.y)).toEqual(
      [0, 1, 2].map((i) => band.y + m.padding + i * m.lineHeight),
    );
    expect(lines.every((l) => l.x === m.padding)).toBe(true);
  });

  it('shortens a line wider than the image', () => {
    const long = 'x'.repeat(500);
    const { lines } = layoutStamp(600, 450, [long], width);
    expect(lines[0]!.text.endsWith('…')).toBe(true);
    expect(width(lines[0]!.text)).toBeLessThanOrEqual(600 - 2 * stampMetrics(600, 450).padding);
  });
});
