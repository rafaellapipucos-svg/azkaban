import { randomUUID } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';

// Needs `pnpm db:start`. Small fixes from the phase 2 audit, one test each.
const button = (page: Page, name: string) =>
  page.getByRole('button', { name, exact: true }).locator('visible=true');

const ZONE = 'America/Sao_Paulo';
const todayLocal = () => new Intl.DateTimeFormat('en-CA', { timeZone: ZONE }).format(new Date());
const plusDays = (date: string, days: number) =>
  new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);

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
  await expect(page.getByRole('heading', { name: 'Hoje', exact: true })).toBeVisible();
}

test('a load error does not also say there is nothing to do, and offers to try again', async ({
  page,
}) => {
  await signUpWithContext(page, 'Erro');
  await page.route('**/rest/v1/task_occurrences*', (route) => route.fulfill({ status: 500 }));
  await page.reload();

  // React Query retries a failed read three times (1, 2 and 4 s) before the screen gives up
  await expect(page.getByText('Não deu para carregar as tarefas.')).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByText('Nada pendente por aqui.', { exact: false })).toHaveCount(0);

  await page.unroute('**/rest/v1/task_occurrences*');
  await button(page, 'Tentar de novo').click();
  await expect(page.getByText('Não deu para carregar as tarefas.')).toHaveCount(0);
  await expect(page.getByText('Nada pendente por aqui.', { exact: false })).toBeVisible();
});

test('only a done task is crossed out; "Tentei" is not', async ({ page }) => {
  await signUpWithContext(page, 'Risco');
  for (const title of ['Verde', 'Amarela']) {
    await button(page, 'Nova tarefa').click();
    await page.getByLabel('O que precisa ser feito?').fill(title);
    await button(page, 'Criar').click();
    await expect(page.getByText('Pronto! A tarefa foi criada.')).toBeVisible();
  }
  const title = (name: string) => page.getByText(name, { exact: true }).locator('visible=true');

  await page.getByRole('checkbox', { name: 'Verde: Pendente' }).locator('visible=true').click();
  await expect(title('Verde')).toHaveCSS('text-decoration-line', 'line-through');

  await button(page, 'Mais opções: Amarela').click();
  await button(page, 'Tentei, mas não consegui').click();
  await page.getByLabel('O que aconteceu? (uma frase curta)').fill('Faltou tempo');
  await button(page, 'Confirmar').click();
  await expect(
    page.getByRole('checkbox', { name: 'Amarela: Tentei' }).locator('visible=true'),
  ).toBeVisible();
  await expect(title('Amarela')).not.toHaveCSS('text-decoration-line', 'line-through');
});

test('the day view starts in the morning, or at the first task when it is earlier', async ({
  page,
}) => {
  await signUpWithContext(page, 'Manha');
  const day = plusDays(todayLocal(), 1);
  const hour = (time: string) => page.getByText(time, { exact: true }).locator('visible=true');

  await page.goto(`/calendar?view=day&date=${day}`);
  await expect(hour('06:00')).toBeVisible();
  await expect(hour('00:00')).toHaveCount(0);

  await page.goto(`/tasks/new?day=${day}&time=03:00`);
  await page.getByLabel('O que precisa ser feito?').fill('Madrugada');
  await button(page, 'Salvar').click();
  // A `goto` right after the click cancels the save that is still in flight.
  await expect(page.getByRole('heading', { name: 'Hoje', exact: true })).toBeVisible();
  await page.goto(`/calendar?view=day&date=${day}`);
  await expect(hour('03:00')).toBeVisible();
  await expect(hour('02:00')).toHaveCount(0);
});

test('a detail opened while the status is saving shows the new status when the save ends', async ({
  page,
}) => {
  await signUpWithContext(page, 'Corrida');
  await button(page, 'Nova tarefa').click();
  await page.getByLabel('O que precisa ser feito?').fill('Lavar');
  await button(page, 'Criar').click();
  await expect(page.getByText('Pronto! A tarefa foi criada.')).toBeVisible();

  // The first read of the detail reaches the database before the commit, and answers after it
  let readDone = () => {};
  const read = new Promise<void>((resolve) => (readDone = resolve));
  await page.route('**/rest/v1/rpc/set_occurrence_status', async (route) => {
    await read;
    await route.continue();
  });
  await page.route(
    '**/rest/v1/task_status_history*',
    async (route) => {
      const response = await route.fetch();
      const saved = page.waitForResponse('**/rest/v1/rpc/set_occurrence_status');
      readDone();
      await saved;
      await page.waitForTimeout(300); // the screen hears of the save first
      await route.fulfill({ response });
    },
    { times: 1 },
  );
  await button(page, 'Mais opções: Lavar').click();
  await button(page, 'Tentei, mas não consegui').click();
  await page.getByLabel('O que aconteceu? (uma frase curta)').fill('Faltou sabão');
  await button(page, 'Confirmar').click();
  await expect(
    page.getByRole('checkbox', { name: 'Lavar: Tentei' }).locator('visible=true'),
  ).toBeVisible();
  await page.getByText('Lavar', { exact: true }).locator('visible=true').click();

  // Known bug, in docs/agentes/handoffs/20261101-2240-qa-testes-para-tarefas-calendario-detalhe-defasado.md.
  // Declared here, so that only this assertion may fail. Delete this line along with the fix.
  test.fail();
  await expect(page.getByText('Pendente → Tentei')).toBeVisible({ timeout: 5_000 });
});

test('the context form cannot be saved before its areas arrive, instead of doing nothing', async ({
  page,
}) => {
  await signUpWithContext(page, 'Areas');
  await page.route('**/rest/v1/areas*', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 3_000));
    await route.continue();
  });
  await page.goto('/contexts/new');
  await page.getByLabel('Nome', { exact: true }).fill('Oficina');
  await expect(button(page, 'Salvar')).toBeDisabled();
  await expect(button(page, 'Salvar')).toBeEnabled({ timeout: 10_000 });
  await button(page, 'Salvar').click();
  await expect(page.getByRole('heading', { name: 'Hoje', exact: true })).toBeVisible();
});
