// Draws the app icons, the splash and the notification icon from Broto and the tokens, into
// packages/ui/assets/brand. Run by hand after changing the mascot or the palette, and commit the
// PNGs: `pnpm --filter @azkaban/ui brand`. Uses the Chromium of the E2E (`pnpm exec playwright install chromium`).
import { mkdirSync } from 'node:fs';
import { URL, fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
// Node 24 strips the types. Neither file has runtime imports.
import { brandAssets, brandSvg } from '../src/mascotArt.ts';
import { brandPalette } from '../src/tokens.ts';

const out = new URL('../assets/brand/', import.meta.url);
mkdirSync(out, { recursive: true });

const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  for (const asset of brandAssets(brandPalette)) {
    const { size } = asset;
    await page.setViewportSize({ width: size, height: size });
    await page.setContent(
      `<html><body style="margin:0;background:transparent">${brandSvg(asset)}</body></html>`,
    );
    await page.screenshot({
      path: fileURLToPath(new URL(asset.file, out)),
      clip: { x: 0, y: 0, width: size, height: size },
      omitBackground: !asset.background,
    });
  }
} finally {
  await browser.close();
}
