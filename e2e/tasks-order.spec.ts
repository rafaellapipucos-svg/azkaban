import { randomUUID } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';

// Needs `pnpm db:start`. Quick create gives every task the same "next full hour", so a screenful
// of tasks that start together is the normal case, not a corner one.
const button = (page: Page, name: string) =>
  page.getByRole('button', { name, exact: true }).locator('visible=true');

/** The titles of the visible task rows, top to bottom. */
const titles = (page: Page) =>
  page
    .getByRole('checkbox')
    .locator('visible=true')
    .evaluateAll((rows) =>
      rows.map((row) => (row.getAttribute('aria-label') ?? '').replace(/: .*$/, '')),
    );

test('tasks that start together keep their place when one of them changes status', async ({
  page,
}) => {
  await page.goto('/sign-up');
  await page.getByLabel('Seu nome').fill('Ordem');
  await page.getByLabel('E-mail', { exact: true }).fill(`ordem-${randomUUID()}@example.com`);
  await page.getByLabel('Senha').fill(randomUUID());
  await button(page, 'Criar conta').first().click();
  await button(page, 'Novo contexto').click();
  await page.getByLabel('Nome', { exact: true }).fill('Casa');
  await button(page, 'Salvar').click();
  await expect(page.getByRole('heading', { name: 'Hoje', exact: true })).toBeVisible();

  const names = Array.from({ length: 8 }, (_, i) => `T${i + 1}`);
  for (const name of names) {
    await button(page, 'Nova tarefa').click();
    await page.getByLabel('O que precisa ser feito?').fill(name);
    await button(page, 'Criar').click();
    await expect(page.getByText('Pronto! A tarefa foi criada.')).toBeVisible();
    await expect(
      page.getByRole('checkbox', { name: `${name}: Pendente` }).locator('visible=true'),
    ).toBeVisible();
  }

  // Creation order, not whatever order Postgres happens to return ties in
  expect(await titles(page)).toEqual(names);

  await page.getByRole('checkbox', { name: 'T3: Pendente' }).locator('visible=true').click();
  await expect(
    page.getByRole('checkbox', { name: 'T3: Feito' }).locator('visible=true'),
  ).toBeVisible();
  expect(await titles(page)).toEqual(names);

  // Also after the list is read again from the database
  await page.reload();
  await expect(
    page.getByRole('checkbox', { name: 'T3: Feito' }).locator('visible=true'),
  ).toBeVisible();
  expect(await titles(page)).toEqual(names);
});
