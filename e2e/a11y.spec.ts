import { expect, test, type Page } from '@playwright/test';
import { button, groupWithMember, uniqueTitle } from './proof-fixtures';
import { SIZES } from './walk';

// Needs `pnpm db:start`. F8-1 of ADR-0012, section 9, without a new dependency: every screen of the
// app at 320, 375 and 1280 px, light and dark, with reduced motion on, audited in the page (names
// and roles, text contrast AA against the painted background, targets of 44 px, no sideways
// scroll, no cut text, nothing moving), plus the keyboard (Tab reaches controls, each with a ring)
// and text at 200% (375 px zoomed is 188 CSS px wide). It collects every problem and fails at the
// end with the full list, so one bad screen does not hide the others. A screen reader is not this.

test.use({ reducedMotion: 'reduce' });

type Report = Record<string, string[]>;

/** Runs in the page: the problems of the visible screen as it is now. */
function audit(doc: HTMLElement) {
  const visible = (el: Element) => {
    const box = el.getBoundingClientRect();
    const style = getComputedStyle(el);
    return box.width > 0 && box.height > 0 && style.visibility !== 'hidden';
  };
  const main =
    [...doc.querySelectorAll('[role="main"]')].filter(visible).at(-1) ?? doc.ownerDocument.body;
  const short = (el: Element) =>
    (el.getAttribute('aria-label') ?? el.textContent?.trim() ?? el.tagName).slice(0, 40);
  const parse = (color: string) => {
    const [r, g, b, a = 1] = color.match(/[\d.]+/g)!.map(Number);
    return [r!, g!, b!, a] as const;
  };
  const luminance = ([r, g, b]: readonly number[]) => {
    const lin = (c: number) => ((c /= 255) <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
    return 0.2126 * lin(r!) + 0.7152 * lin(g!) + 0.0722 * lin(b!);
  };
  const over = (top: readonly number[], under: readonly number[]) =>
    [0, 1, 2].map((i) => top[i]! * top[3]! + under[i]! * (1 - top[3]!)).concat(1);
  // The painted background: the first opaque one up the tree, blending translucent ones on top.
  const background = (el: Element | null): number[] => {
    const layers: (readonly number[])[] = [];
    for (let node = el; node; node = node.parentElement) {
      const bg = parse(getComputedStyle(node).backgroundColor);
      if (bg[3] > 0) layers.push(bg);
      if (bg[3] >= 1) break;
    }
    let color: number[] = [255, 255, 255, 1];
    for (const layer of layers.reverse()) color = over(layer, color);
    return color;
  };
  const opacity = (el: Element) => {
    let value = 1;
    for (let node: Element | null = el; node; node = node.parentElement)
      value *= Number(getComputedStyle(node).opacity);
    return value;
  };

  const controls = [
    ...main.querySelectorAll(
      'button, [role="button"], [role="switch"], [role="radio"], [role="checkbox"], [role="tab"], [role="link"], input, textarea, a[href]',
    ),
  ].filter(visible);
  const nameOf = (el: Element) =>
    el.getAttribute('aria-label') ||
    (el.getAttribute('aria-labelledby') ?? '')
      .split(' ')
      .map((id) => doc.ownerDocument.getElementById(id)?.textContent ?? '')
      .join('')
      .trim() ||
    el.textContent?.trim() ||
    el.getAttribute('title') ||
    [...((el as HTMLInputElement).labels ?? [])].map((l) => l.textContent).join('');
  const unnamed = controls.filter((el) => !nameOf(el)).map((el) => el.outerHTML.slice(0, 80));
  const small = controls
    .map((el) => ({ el, box: el.getBoundingClientRect() }))
    .filter(({ box }) => box.width < 44 || box.height < 44)
    .map(({ el, box }) => `${short(el)} ${Math.round(box.width)}x${Math.round(box.height)}`);

  const texts = [...main.querySelectorAll('*')].filter(
    (el) =>
      visible(el) && [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent!.trim()),
  );
  const cut = texts
    .filter((el) => el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1)
    .filter((el) => getComputedStyle(el).overflow !== 'visible')
    .map(short);
  const contrast = texts
    // Disabled controls are exempt (WCAG 1.4.3)
    .filter((el) => !el.closest('[aria-disabled="true"], :disabled'))
    // An emoji is drawn in its own colors, not in `color`
    .filter((el) => !/^[\p{Extended_Pictographic}️‍\s]+$/u.test(el.textContent!.trim()))
    .flatMap((el) => {
      const style = getComputedStyle(el);
      const fg = parse(style.color);
      const bg = background(el);
      const painted = over([fg[0], fg[1], fg[2], fg[3] * opacity(el)], bg);
      const [l1, l2] = [luminance(painted), luminance(bg)].sort((a, b) => b - a);
      const ratio = (l1! + 0.05) / (l2! + 0.05);
      const size = parseFloat(style.fontSize);
      const large = size >= 24 || (size >= 18.66 && Number(style.fontWeight) >= 700);
      return ratio < (large ? 3 : 4.5) ? [`${short(el)} ${ratio.toFixed(2)}:1`] : [];
    });
  const images = [...main.querySelectorAll('img:not([alt]), [role="img"]')]
    .filter((el) => visible(el) && !nameOf(el) && !el.closest('[aria-hidden="true"]'))
    .map((el) => el.outerHTML.slice(0, 60));
  const headings = [...main.querySelectorAll('h1, [role="heading"][aria-level="1"]')].filter(
    visible,
  ).length;
  return {
    sideways: doc.scrollWidth - doc.clientWidth,
    unnamed,
    small,
    cut,
    contrast,
    images,
    h1: headings,
    lang: doc.getAttribute('lang') ?? '',
    title: doc.ownerDocument.title,
    animations: doc.ownerDocument.getAnimations().filter((a) => a.playState === 'running').length,
    transforms: [...main.querySelectorAll('*')].map((el) => getComputedStyle(el).transform).join(),
  };
}

const notes: Report = {};
const note = (key: string, items: string[]) => {
  if (items.length) (notes[key] ??= []).push(...new Set(items));
};
let screens = 0;

async function check(page: Page, step: string) {
  screens++;
  await page.locator('[role="main"]:visible, body').last().waitFor();
  await page.waitForLoadState('networkidle', { timeout: 3000 }).catch(() => undefined);
  const started = Date.now();
  for (const scheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' });
    for (const width of SIZES) {
      await page.setViewportSize({ width, height: 800 });
      const where = `${step} ${width}px ${scheme}`;
      const first = await page.locator('html').evaluate(audit);
      await page.waitForTimeout(250);
      const second = await page.locator('html').evaluate(audit);
      if (first.sideways > 0) note(`sideways`, [`${where}: ${first.sideways}px`]);
      note(`unnamed: ${where}`, first.unnamed);
      note(`small: ${where}`, first.small);
      note(`cut: ${where}`, first.cut);
      note(`contrast: ${where}`, first.contrast);
      note(`images without a name: ${where}`, first.images);
      if (first.h1 !== 1) note('h1 count', [`${where}: ${first.h1}`]);
      if (first.lang !== 'pt-BR') note('lang', [`${where}: "${first.lang}"`]);
      if (!first.title) note('title', [where]);
      if (second.animations > 0) note('running animations with reduce', [where]);
      if (first.transforms !== second.transforms) note('moving with reduce', [where]);
    }
  }
  // Text at 200%: 375 px zoomed twice is 188 CSS px.
  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 188, height: 800 });
  const zoom = await page.locator('html').evaluate(audit);
  if (zoom.sideways > 0) note('sideways at 200%', [`${step}: ${zoom.sideways}px`]);
  note(`cut at 200%: ${step}`, zoom.cut);
  // Keyboard: Tab from the top reaches controls, each with a visible ring.
  await page.setViewportSize({ width: 1280, height: 800 });
  await page
    .locator('body')
    .evaluate((body) => (body.ownerDocument.activeElement as HTMLElement)?.blur());
  const reached = new Set<string>();
  const noRing: string[] = [];
  for (let n = 0; n < 40; n++) {
    await page.keyboard.press('Tab');
    const focus = await page.locator('body').evaluate((body) => {
      const el = body.ownerDocument.activeElement as HTMLElement | null;
      if (!el || el === body) return null;
      const style = getComputedStyle(el);
      const ring =
        (style.outlineStyle !== 'none' && style.outlineWidth !== '0px') ||
        style.boxShadow !== 'none';
      return {
        id: `${el.tagName}:${(el.getAttribute('aria-label') ?? el.textContent ?? '').slice(0, 30)}`,
        ring,
      };
    });
    if (!focus) continue;
    if (reached.has(focus.id)) break;
    reached.add(focus.id);
    if (!focus.ring) noRing.push(focus.id);
  }
  if (reached.size === 0) note('keyboard reaches nothing', [step]);
  note(`no focus ring: ${step}`, noRing);
  await page.setViewportSize({ width: 412, height: 839 });
  console.log(`a11y ${step}: ${Date.now() - started} ms`);
}

test('every screen: names, contrast, targets, reflow, zoom, keyboard and reduced motion', async ({
  browser,
}) => {
  test.setTimeout(900_000);
  const { ownerPage: page } = await groupWithMember(browser);

  // Signed out, in a context of its own
  const out = await (await browser.newContext({ reducedMotion: 'reduce' })).newPage();
  for (const path of [
    '/welcome',
    '/sign-in',
    '/sign-up',
    '/transparency',
    '/join/AAAAAAAAAA',
    '/nao-existe',
  ]) {
    await out.goto(path);
    await check(out, `signed out ${path}`);
  }

  // What the owner has: a task, a list, the group and its context
  const title = uniqueTitle('Regar');
  await page.goto('/');
  await button(page, 'Nova tarefa').click();
  await page.getByLabel('O que precisa ser feito?').fill(title);
  await button(page, 'Criar').click();
  await page.getByText(title, { exact: true }).locator('visible=true').click();
  await expect(page).toHaveURL(/\/tasks\/[0-9a-f-]{36}$/);
  const task = new URL(page.url()).pathname;
  await page.goto('/shopping');
  await page.getByLabel('Nome da nova lista').fill(uniqueTitle('Feira'));
  await button(page, 'Criar lista').click();
  await expect(page).toHaveURL(/\/shopping\/[0-9a-f-]{36}\?mode=build$/);
  const list = new URL(page.url()).pathname;
  await page.goto('/groups');
  await page.getByRole('button', { name: /^Equipe P/ }).click();
  await expect(page).toHaveURL(/\/groups\/[0-9a-f-]{36}$/);
  const groupId = new URL(page.url()).pathname.split('/').at(-1)!;
  await page.goto('/contexts');
  await page
    .getByRole('button', { name: /^Escritório/ })
    .first()
    .click();
  await expect(page).toHaveURL(/\/contexts\/[0-9a-f-]{36}$/);
  const context = new URL(page.url()).pathname;

  for (const path of [
    '/',
    '/calendar',
    '/area/work',
    '/shopping',
    '/profile',
    '/notifications',
    '/settings/notifications',
    '/settings/privacy',
    '/push-setup',
    '/contexts',
    '/contexts/new',
    context,
    '/groups',
    '/groups/new',
    `/groups/${groupId}`,
    `/team/${groupId}`,
    `/reviews/${groupId}`,
    '/tasks/new',
    task,
    `${task}/edit`,
    `${list}?mode=build`,
    `${list}?mode=market`,
    '/shopping/catalog',
    '/shopping/history',
    `/transparency?groupId=${groupId}`,
  ]) {
    await page.goto(path);
    await check(page, path);
  }

  const total = Object.values(notes).reduce((n, items) => n + items.length, 0);
  console.log(`a11y: ${screens} screens x 6 + zoom + keyboard; ${total} problems`);
  await test.info().attach('a11y.json', { body: JSON.stringify(notes, null, 1) });
  // Known problems, each with a handoff, as one pattern per line; the rest fails. Empty since QA8-4
  // to QA8-7 were fixed on 2026-11-03. Remove a line when its fix lands.
  const known: RegExp[] = [];
  const unknown = Object.entries(notes)
    .flatMap(([key, items]) => items.map((item) => `${key}: ${item}`))
    .filter((line) => !known.some((pattern) => pattern.test(line)));
  expect(unknown).toEqual([]);
});
