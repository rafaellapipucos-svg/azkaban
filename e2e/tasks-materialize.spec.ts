import { randomUUID } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';

// Needs `pnpm db:start`, which serves the functions too. Saving a repeating task must not
// wait for the Edge Function (4 to 14 s measured), and a failure of it must be visible.
const button = (page: Page, name: string) =>
  page.getByRole('button', { name, exact: true }).locator('visible=true');

const hoje = (page: Page) => page.getByRole('heading', { name: 'Hoje', exact: true });
const FUNCTION = '**/functions/v1/materialize-occurrences';

async function signUpWithContext(page: Page, name: string) {
  await page.goto('/sign-up');
  await page.getByLabel('Seu nome').fill(name);
  await page
    .getByLabel('E-mail', { exact: true })
    .fill(`${name.toLowerCase()}-${randomUUID()}@example.com`);
  await page.getByLabel('Senha').fill(randomUUID());
  await button(page, 'Criar conta').first().click();
  await button(page, 'Novo contexto').click();
  await page.getByLabel('Nome', { exact: true }).fill('Casa');
  await button(page, 'Salvar').click();
  await expect(hoje(page)).toBeVisible();
}

/** Fills the form of a daily task starting today and presses Salvar. Does not wait for anything. */
async function saveDailyTask(page: Page, title: string) {
  await button(page, 'Nova tarefa').click();
  await page.getByLabel('O que precisa ser feito?').fill(title);
  await button(page, 'Mais opções').click();
  await page.getByRole('switch', { name: 'Repetir' }).click();
  await button(page, 'Salvar').click();
}

const rows = (page: Page, title: string) =>
  page.getByRole('checkbox', { name: new RegExp(`^${title}:`) }).locator('visible=true');

test('saving a repeating task goes back at once while the function is still running', async ({
  page,
}) => {
  await signUpWithContext(page, 'Rapido');
  // A slow function: a cold start measured 4 to 14 seconds. Only the first call is slow, so a
  // retry after a failure does not stack another delay on top.
  let calls = 0;
  await page.route(FUNCTION, async (route) => {
    calls += 1;
    if (calls === 1) await new Promise((resolve) => setTimeout(resolve, 6_000));
    await route.continue();
  });

  await saveDailyTask(page, 'Treino');
  // The old form kept the spinner on Salvar until the function answered.
  await expect(hoje(page)).toBeVisible({ timeout: 4_000 });
  await expect(
    page.getByRole('status').getByText('Criando as repetições da tarefa...'),
  ).toBeVisible();

  // When it finishes, the list refreshes by itself and the notice goes away
  await expect(rows(page, 'Treino').first()).toBeVisible({ timeout: 45_000 });
  await expect(page.getByText('Criando as repetições da tarefa...')).toHaveCount(0);
});

test('when the function fails the person is told, and "Tentar de novo" creates the days', async ({
  page,
}) => {
  await signUpWithContext(page, 'Falha');
  await page.route(FUNCTION, (route) => route.abort());

  await saveDailyTask(page, 'Leitura');
  await expect(hoje(page)).toBeVisible({ timeout: 4_000 });
  const alert = page.getByRole('alert').filter({ hasText: 'repetições ainda não apareceram' });
  await expect(alert).toBeVisible();
  await expect(rows(page, 'Leitura')).toHaveCount(0);

  await page.unroute(FUNCTION);
  await alert.getByRole('button', { name: 'Tentar de novo', exact: true }).click();
  await expect(rows(page, 'Leitura').first()).toBeVisible();
  await expect(alert).toHaveCount(0);
});

test('reloading while the function runs does not lose the days of the task', async ({ page }) => {
  await signUpWithContext(page, 'Recarrega');
  // The first request never answers, like a tab closed in the middle; the next ones go through
  let calls = 0;
  await page.route(FUNCTION, async (route) => {
    calls += 1;
    if (calls === 1) return;
    await route.continue();
  });

  await saveDailyTask(page, 'Caminhada');
  await expect(hoje(page)).toBeVisible({ timeout: 4_000 });
  await page.reload();
  await expect(rows(page, 'Caminhada').first()).toBeVisible();
});
