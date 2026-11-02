import { randomUUID } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';

// Needs `pnpm db:start`, which serves the functions too.
const button = (page: Page, name: string) =>
  page.getByRole('button', { name, exact: true }).locator('visible=true');

test('edit this and the following, then reschedule one', async ({ page }) => {
  await page.goto('/sign-up');
  await page.getByLabel('Seu nome').fill('Muda');
  await page.getByLabel('E-mail', { exact: true }).fill(`muda-${randomUUID()}@example.com`);
  await page.getByLabel('Senha').fill(randomUUID());
  await button(page, 'Criar conta').first().click();
  await button(page, 'Novo contexto').click();
  await page.getByLabel('Nome', { exact: true }).fill('Casa');
  await page.getByRole('radio', { name: /Doméstico/ }).click();
  await button(page, 'Salvar').click();
  await button(page, 'Nova tarefa').click();
  await page.getByLabel('O que precisa ser feito?').fill('Ginástica');
  await button(page, 'Mais opções').click();
  await page.getByRole('switch', { name: 'Repetir' }).click();
  await button(page, 'Salvar').click();

  // This and the following, starting with today's: the whole series gets the new name
  await page.getByText('Ginástica', { exact: true }).click();
  await button(page, 'Editar').click();
  await button(page, 'Esta e as próximas').click();
  await page.getByLabel('O que precisa ser feito?').fill('Ginástica nova');
  await button(page, 'Salvar').click();
  // It lands on the list, because the occurrence that was open may no longer exist
  await expect(page.getByRole('heading', { name: 'Hoje', exact: true })).toBeVisible();
  await page.getByRole('tab', { name: 'Doméstico' }).click();
  await expect(page.getByText('Ginástica', { exact: true })).toHaveCount(0);
  // The new series reaches the following days: the area tab lists two weeks
  await expect(page.getByRole('checkbox', { name: 'Ginástica nova: Pendente' })).toHaveCount(14);

  // Reschedule only the first one
  // Hoje stays mounted behind the tab, earlier in the page, so the area's row is the last
  await page.getByText('Ginástica nova', { exact: true }).last().click();
  await button(page, 'Reagendar').click();
  await expect(
    page.getByText('Só esta vez muda de horário. As outras continuam como estão.'),
  ).toBeVisible();
  await button(page, 'Salvar novo horário').click();
  await expect(page.getByRole('heading', { name: 'Ginástica nova' })).toBeVisible();
});
