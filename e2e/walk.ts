import { expect, type Page } from '@playwright/test';

export const SIZES = [320, 375, 1280];

/**
 * The screen as it is now, at 320, 375 and 1280 px, light and dark: no sideways scroll, every
 * control of the main area at least 44 px each way, no text cut by its box, and a visible focus.
 */
export async function walk(page: Page, step: string) {
  for (const scheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    if (scheme === 'dark') await expect(page.locator('html')).toHaveClass(/\bdark\b/);
    else await expect(page.locator('html')).not.toHaveClass(/\bdark\b/);
    for (const width of SIZES) {
      const where = `${step}, ${width} px, ${scheme}`;
      await page.setViewportSize({ width, height: 800 });
      const report = await page.locator('html').evaluate((doc) => {
        const visible = (el: Element) => {
          const box = el.getBoundingClientRect();
          return box.width > 0 && box.height > 0 && getComputedStyle(el).visibility !== 'hidden';
        };
        // The stack keeps earlier screens mounted and hidden, each with its own main
        const main = [...doc.querySelectorAll('[role="main"]')].filter(visible).at(-1)!;
        const label = (el: Element) =>
          el.getAttribute('aria-label') ?? el.textContent?.trim().slice(0, 40) ?? el.tagName;
        const small = [
          ...main.querySelectorAll(
            'button, [role="button"], [role="switch"], [role="radio"], [role="checkbox"], input, a[href]',
          ),
        ]
          .filter(visible)
          .map((el) => ({ el, box: el.getBoundingClientRect() }))
          .filter(({ box }) => box.width < 44 || box.height < 44)
          .map(({ el, box }) => `${label(el)} ${Math.round(box.width)}x${Math.round(box.height)}`);
        const cut = [...main.querySelectorAll('div, span')]
          .filter(
            (el) =>
              visible(el) &&
              [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent!.trim()),
          )
          .filter(
            (el) => el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1,
          )
          .map((el) => label(el));
        return { sideways: doc.scrollWidth - doc.clientWidth, small, cut };
      });
      expect(report.sideways, where).toBeLessThanOrEqual(0);
      expect(report.small, where).toEqual([]);
      expect(report.cut, where).toEqual([]);
    }
    // A button reached by the keyboard shows a ring
    await page
      .locator('[role="main"]:visible')
      .last()
      .getByRole('button')
      .locator('visible=true')
      .last()
      .focus();
    await page.keyboard.press('Shift+Tab');
    await page.keyboard.press('Tab');
    const ring = await page.locator('html').evaluate((doc) => {
      const style = getComputedStyle(doc.ownerDocument.activeElement!);
      return style.outlineStyle !== 'none' && style.outlineWidth !== '0px'
        ? 'outline'
        : style.boxShadow;
    });
    expect(ring, `${step}, ${scheme}: focus ring`).not.toBe('none');
  }
  await page.emulateMedia({ colorScheme: 'light' });
  await page.setViewportSize({ width: 412, height: 839 });
}
