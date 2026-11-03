import { expect, test, type Page } from '@playwright/test';
import { sql } from '../supabase/functions/_shared/proof-kit';
import { button, check, newUser, signUp } from './proof-fixtures';

// Needs `pnpm db:start`. The measured goals 2 to 4 of ADR-0012, section 10 (F8-6). Only the REST
// count is a barrier; the times are written as annotations, because a shared machine is noisy.

const userIdOf = (email: string) => sql(`select id from auth.users where email = '${email}'`)[0]!;

async function signUpWithContext(page: Page, name: string) {
  const user = newUser(name);
  await signUp(page, user);
  await button(page, 'Novo contexto').click();
  await page.getByLabel('Nome', { exact: true }).fill('Casa');
  await button(page, 'Salvar').click();
  await expect(page.getByRole('heading', { name: 'Hoje', exact: true })).toBeVisible();
  return userIdOf(user.email);
}

/** `count` all-day tasks for today, straight in the database (the trigger makes the occurrences). */
function seedTasks(userId: string, count: number, from = 0) {
  sql(`insert into public.tasks (context_id, assignee_id, created_by, title, schedule_type, start_at,
      timezone, reminders, requires_photo_proof, requires_admin_approval, requires_partial_reason,
      difficulty, priority, visibility)
    select (select id from public.contexts where owner_user_id = '${userId}' limit 1), '${userId}',
      '${userId}', 'Tarefa ' || lpad(n::text, 3, '0'), 'all_day',
      (date_trunc('day', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo'),
      'America/Sao_Paulo', '[]', false, false, false, 'easy', 'normal', 'private'
    from generate_series(${from + 1}, ${from + count}) n`);
}

/** Records, every frame, the time and how many `selector` are drawn. */
const sampleFrames = (selector: string) =>
  `window.__frames = []; const tick = () => { window.__frames.push([performance.now(), document.querySelectorAll('${selector}').length]); requestAnimationFrame(tick); }; requestAnimationFrame(tick);`;

/** Milliseconds from the last REST answer to the first frame with a row, and the rows then. */
async function drawTime(page: Page, table: string) {
  return page.evaluate((name) => {
    const frames = (globalThis as unknown as { __frames: [number, number][] }).__frames;
    const first = frames.find(([, n]) => n > 0)!;
    const answered = performance
      .getEntriesByType('resource')
      .filter((e) => e.name.includes('/rest/v1/') && e.name.includes(name))
      .map((e) => (e as PerformanceResourceTiming).responseEnd)
      .filter((end) => end <= first[0]);
    return { ms: Math.round(first[0] - Math.max(...answered)), rows: frames.at(-1)![1] };
  }, table);
}

test('Hoje with 50 occurrences makes few REST calls, and 200 draw fast with the CPU 4x slower', async ({
  page,
}) => {
  test.setTimeout(180_000);
  const userId = await signUpWithContext(page, 'Muitas');
  seedTasks(userId, 50);

  await page.reload();
  await expect(check(page, 'Tarefa 001', 'Pendente')).toBeVisible();
  await page.waitForLoadState('networkidle');
  // The resource entries of the new document, not `page.on('request')`: that one also counted a
  // `notifications` the page before the reload sent while unloading (4 in a run of the build).
  const calls = await page.evaluate(() =>
    performance
      .getEntriesByType('resource')
      .map((e) => new URL(e.name).pathname)
      .filter((path) => path.startsWith('/rest/v1/')),
  );
  test.info().annotations.push({ type: 'rest calls, Hoje with 50', description: calls.join(' ') });
  console.log(`F8-6 goal 2: ${calls.length} REST calls opening Hoje with 50 occurrences`, calls);
  // The goal is 14 (ADR-0012, section 10, QA8-3), `user_stats` once since `statsStaleMs`. The other
  // barrier is "no N+1": no path more than 3 times, whatever the number of occurrences.
  expect(calls.length).toBeLessThanOrEqual(14);
  const perPath = new Map<string, number>();
  for (const path of calls) perPath.set(path, (perPath.get(path) ?? 0) + 1);
  expect(Math.max(...perPath.values())).toBeLessThanOrEqual(3);

  seedTasks(userId, 150, 50);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await page.addInitScript(sampleFrames('[role="checkbox"]'));
  await page.reload();
  await expect(check(page, 'Tarefa 001', 'Pendente')).toBeVisible({ timeout: 60_000 });
  await page.waitForTimeout(2000);
  const today = await drawTime(page, 'task_occurrences');
  test.info().annotations.push({ type: 'Hoje 200, CPU 4x', description: JSON.stringify(today) });
  console.log('F8-6 goal 3, Hoje with 200, CPU 4x:', today);
});

test('the month of the calendar with 200 tasks today draws fast with the CPU 4x slower', async ({
  page,
}) => {
  test.setTimeout(180_000);
  const userId = await signUpWithContext(page, 'Mes');
  seedTasks(userId, 200);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  // The marker: today's cell, once its spoken summary counts the 200 ("2026" holds no "200").
  const today = '[aria-current="date"][aria-label*="200"]';
  await page.addInitScript(sampleFrames(today));
  await page.goto('/calendar');
  await expect(page.locator(today)).toBeVisible({ timeout: 60_000 });
  await page.waitForTimeout(2000);
  const month = await drawTime(page, 'task_occurrences');
  test.info().annotations.push({ type: 'month 200, CPU 4x', description: JSON.stringify(month) });
  console.log('F8-6 goal 3, month with 200, CPU 4x:', month);
});

test('"No mercado" with 200 items draws fast with the CPU 4x slower', async ({ page }) => {
  test.setTimeout(180_000);
  await signUpWithContext(page, 'Mercado');
  await page.goto('/shopping');
  await page.getByLabel('Nome da nova lista').fill('Grande');
  await button(page, 'Criar lista').click();
  await expect(page).toHaveURL(/\/shopping\/[0-9a-f-]{36}\?mode=build$/);
  const listId = new URL(page.url()).pathname.split('/').at(-1)!;
  sql(`insert into public.shopping_list_items (list_id, name, category, quantity, unit)
    select '${listId}', 'Item ' || lpad(n::text, 3, '0'), 'pantry', 1, 'unit'
    from generate_series(1, 200) n`);

  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await page.addInitScript(sampleFrames('[role="checkbox"]'));
  await page.goto(`/shopping/${listId}?mode=market`);
  await expect(page.getByRole('checkbox', { name: /^Item 001/ })).toBeVisible({ timeout: 60_000 });
  await page.waitForTimeout(2000);
  const market = await drawTime(page, 'shopping_list_items');
  test.info().annotations.push({ type: 'market 200, CPU 4x', description: JSON.stringify(market) });
  console.log('F8-6 goal 3, market with 200, CPU 4x:', market);
});

test('the confetti keeps frames under 50 ms with the CPU 4x slower', async ({ page }) => {
  test.setTimeout(180_000);
  const userId = await signUpWithContext(page, 'Confete');
  seedTasks(userId, 2);
  await page.reload();
  await expect(check(page, 'Tarefa 001', 'Pendente')).toBeVisible();

  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await page.evaluate(sampleFrames('[role="alert"]'));
  await check(page, 'Tarefa 001', 'Pendente').click();
  const card = page.getByRole('alert').locator('visible=true');
  await expect(card.getByText('Tarefa concluída!')).toBeVisible();
  await expect(card.locator(':scope > [aria-hidden="true"]')).toHaveCount(1);
  await expect(card).toHaveCount(0, { timeout: 30_000 });
  const frames = await page.evaluate(() => {
    const all = (globalThis as unknown as { __frames: [number, number][] }).__frames;
    const shown = all.filter(([, n]) => n > 0);
    const during = all.filter(([t]) => t >= shown[0]![0] && t <= shown.at(-1)![0]);
    const gaps = during.slice(1).map(([t], i) => t - during[i]![0]);
    return {
      frames: gaps.length,
      over50: gaps.filter((gap) => gap > 50).length,
      worst: Math.round(Math.max(...gaps)),
    };
  });
  test.info().annotations.push({ type: 'confetti, CPU 4x', description: JSON.stringify(frames) });
  console.log('F8-6 goal 4, confetti with CPU 4x:', frames);
});
