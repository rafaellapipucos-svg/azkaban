import { describe, expect, it } from 'vitest';
import { brandAssets, brandSvg, mascotBox, mascotReach, mascotShapes, reachOf } from './mascotArt';
import { brandPalette } from './tokens';

const assets = brandAssets(brandPalette);
const byFile = (file: string) => {
  const asset = assets.find((a) => a.file === file);
  if (!asset) throw new Error(file);
  return asset;
};

describe('brand assets', () => {
  it('reach covers the farthest points of the drawing', () => {
    const middle = mascotBox / 2;
    const { body } = mascotShapes;
    // The two leaf tips, the bottom of the body and its widest side.
    const points = [
      [44, 8],
      [78, 12],
      [body.cx, body.cy + body.ry],
      [body.cx - body.rx, body.cy],
    ];
    for (const [x = 0, y = 0] of points) {
      expect(Math.hypot(x - middle, y - middle)).toBeLessThanOrEqual(mascotReach);
    }
  });

  it('keeps the Android adaptive layers inside the 66 of 108 dp circle', () => {
    for (const file of ['android-icon-foreground.png', 'android-icon-monochrome.png']) {
      expect(reachOf(byFile(file))).toBeLessThanOrEqual(66 / 108 / 2);
    }
  });

  it('keeps the maskable web icon inside its 80% circle', () => {
    expect(reachOf(byFile('icon-maskable-512.png'))).toBeLessThanOrEqual(0.4);
  });

  it('never crops the drawing', () => {
    for (const asset of assets) expect(reachOf(asset)).toBeLessThanOrEqual(0.5);
  });

  it('gives the iOS icon and the web icons an opaque background', () => {
    for (const file of ['icon.png', 'icon-192.png', 'icon-512.png', 'apple-touch-icon.png']) {
      expect(byFile(file).background).toBe(brandPalette.background);
    }
  });

  it('leaves the layers Android tints transparent and in one colour', () => {
    for (const file of ['android-icon-monochrome.png', 'notification-icon.png']) {
      const asset = byFile(file);
      expect(asset.background).toBeUndefined();
      expect(asset.art).not.toContain(brandPalette.mascot.belly);
    }
  });

  it('draws a square SVG of the asked size, centred', () => {
    const svg = brandSvg({ file: 'x.png', size: 100, fit: 0.6, art: '' });
    expect(svg).toContain('width="100" height="100" viewBox="0 0 100 100"');
    expect(svg).toContain('translate(20 20) scale(0.5)');
  });
});
