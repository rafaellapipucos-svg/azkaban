import { randomUUID } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';

// Needs `pnpm db:start`. Accounts are unique per run and exist only in the local database.
const button = (page: Page, name: string) =>
  page.getByRole('button', { name, exact: true }).locator('visible=true');

test('saving a task into a context archived meanwhile says so, in words the person can act on', async ({
  page,
}) => {
  await page.goto('/sign-up');
  await page.getByLabel('Seu nome').fill('Arquivo');
  await page.getByLabel('E-mail', { exact: true }).fill(`arquivo-${randomUUID()}@example.com`);
  await page.getByLabel('Senha').fill(randomUUID());
  await button(page, 'Criar conta').first().click();
  await button(page, 'Novo contexto').click();
  await page.getByLabel('Nome', { exact: true }).fill('Garagem');
  await button(page, 'Salvar').click();
  await expect(page.getByRole('heading', { name: 'Hoje', exact: true })).toBeVisible();

  // A form is open with the context loaded...
  await page.goto('/tasks/new');
  await page.getByLabel('O que precisa ser feito?').fill('Arrumar a bicicleta');

  // ...and in another tab the context is archived
  const other = await page.context().newPage();
  await other.goto('/contexts');
  await other.getByRole('button', { name: /Garagem/ }).click();
  await button(other, 'Arquivar').click();
  const archived = other.waitForResponse(
    (response) =>
      response.url().includes('/rest/v1/contexts') && response.request().method() === 'PATCH',
  );
  await button(other, 'Confirmar arquivamento').click();
  await archived;
  await expect(other.getByRole('button', { name: /Garagem/ })).toHaveCount(0);
  await other.close();

  await button(page, 'Salvar').click();
  await expect(
    page.getByText('Esse contexto foi arquivado. Escolha outro para a tarefa.'),
  ).toBeVisible();
  await expect(page.getByText('Algo deu errado. Tente de novo.')).toHaveCount(0);
});
