import { randomUUID } from 'node:crypto';
import { expect, test, type BrowserContext, type Page } from '@playwright/test';

// Needs `pnpm db:start`, and the root layout running `useOfflineQueue` (ADR-0012, section 5).
// Accounts are unique per run and exist only in the local database.
const button = (page: Page, name: string) =>
  page.getByRole('button', { name, exact: true }).locator('visible=true');
const check = (page: Page, title: string, status: string) =>
  page.getByRole('checkbox', { name: `${title}: ${status}` });

// The queue as saved in the browser's storage, read from outside the page.
const savedQueue = async (context: BrowserContext) =>
  (await context.storageState()).origins
    .flatMap(({ localStorage }) => localStorage)
    .filter(({ name }) => name.startsWith('azkaban.offline-queue.'))
    .map(({ value }) => value)
    .join('');

async function quickCreate(page: Page, title: string) {
  await button(page, 'Nova tarefa').click();
  await page.getByLabel('O que precisa ser feito?').fill(title);
  await button(page, 'Criar').click();
  await expect(page.getByText(title, { exact: true }).locator('visible=true')).toBeVisible();
}

test('a status marked offline survives closing the tab and reaches the database once', async ({
  context,
  page,
}) => {
  await page.goto('/sign-up');
  await page.getByLabel('Seu nome').fill('Offline');
  await page.getByLabel('E-mail', { exact: true }).fill(`offline-${randomUUID()}@example.com`);
  await page.getByLabel('Senha').fill(randomUUID());
  await button(page, 'Criar conta').first().click();
  await button(page, 'Novo contexto').click();
  await page.getByLabel('Nome', { exact: true }).fill('Casa');
  await button(page, 'Salvar').click();
  await expect(page.getByRole('heading', { name: 'Hoje', exact: true })).toBeVisible();
  // Two tasks, so finishing one does not open the perfect day screen.
  await quickCreate(page, 'Regar as plantas');
  await quickCreate(page, 'Varrer a sala');

  // Offline: the row turns green at once, the change waits on the disk, and the notice says so.
  await context.setOffline(true);
  await check(page, 'Regar as plantas', 'Pendente').click();
  await expect(check(page, 'Regar as plantas', 'Feito')).toBeVisible();
  await expect(
    page.getByText('Sem conexão: 1 alteração será enviada quando a internet voltar.'),
  ).toBeVisible();
  await expect.poll(() => savedQueue(context)).toContain('occurrence-status');

  // A change outside the queue fails at once, with the no-connection message, and is not saved.
  await button(page, 'Nova tarefa').click();
  await page.getByLabel('O que precisa ser feito?').fill('Lavar a louça');
  await button(page, 'Criar').click();
  await expect(
    page.getByText(
      'Sem conexão. Esta mudança precisa de internet; tente de novo quando ela voltar.',
    ),
  ).toBeVisible();
  expect(await savedQueue(context)).not.toContain('Lavar a louça');

  // The tab closes before the connection returns; a new one sends what waited.
  await page.close();
  await context.setOffline(false);
  const next = await context.newPage();
  const sent = next.waitForResponse('**/rest/v1/rpc/set_occurrence_status');
  await next.goto('/');
  expect((await sent).status()).toBe(200);
  await expect.poll(() => savedQueue(context)).not.toContain('occurrence-status');

  // What the database says, read again from scratch: done, with one change in the history.
  await next.reload();
  await expect(check(next, 'Regar as plantas', 'Feito')).toBeVisible();
  await expect(check(next, 'Varrer a sala', 'Pendente')).toBeVisible();
  await expect(next.getByText('Lavar a louça', { exact: true })).toHaveCount(0);
  await next.getByText('Regar as plantas', { exact: true }).locator('visible=true').click();
  await expect(next.getByText('Pendente → Feito')).toHaveCount(1);
});

// Offline: signing out must not wait for the network itself (`networkMode` outside the queue).
test('signing out with changes still waiting asks first, then drops them', async ({
  context,
  page,
}) => {
  await page.goto('/sign-up');
  await page.getByLabel('Seu nome').fill('Saída');
  await page.getByLabel('E-mail', { exact: true }).fill(`saida-${randomUUID()}@example.com`);
  await page.getByLabel('Senha').fill(randomUUID());
  await button(page, 'Criar conta').first().click();
  await button(page, 'Novo contexto').click();
  await page.getByLabel('Nome', { exact: true }).fill('Casa');
  await button(page, 'Salvar').click();
  await expect(page.getByRole('heading', { name: 'Hoje', exact: true })).toBeVisible();
  await quickCreate(page, 'Lavar a louça');
  await quickCreate(page, 'Passar o pano');

  await context.setOffline(true);
  await check(page, 'Lavar a louça', 'Pendente').click();
  await expect.poll(() => savedQueue(context)).toContain('occurrence-status');
  await page
    .getByRole('tab', { name: 'Perfil' })
    .or(page.getByRole('link', { name: 'Perfil' }))
    .first()
    .click();
  await button(page, 'Sair').click();
  await expect(
    page.getByText('1 alteração ainda não foi enviada. Se sair agora, ela será perdida.'),
  ).toBeVisible();
  await button(page, 'Sair e descartar').click();
  await expect(page.getByText('Tudo em ordem, todo dia')).toBeVisible();
  await expect.poll(() => savedQueue(context)).not.toContain('occurrence-status');
});
