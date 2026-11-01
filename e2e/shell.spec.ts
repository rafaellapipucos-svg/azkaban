import { randomUUID } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';

// Needs `pnpm db:start`. Accounts are unique per run and exist only in the local database.
const button = (page: Page, name: string) =>
  page.getByRole('button', { name, exact: true }).locator('visible=true');

const hoje = (page: Page) => page.getByRole('heading', { name: 'Hoje', exact: true });

async function signUp(page: Page, name: string) {
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

test('a stack screen opened by address, and then reloaded, always has a way back', async ({
  page,
}) => {
  await signUp(page, 'Recarga');
  await button(page, 'Nova tarefa').click();
  await page.getByLabel('O que precisa ser feito?').fill('Regar as plantas');
  await button(page, 'Criar').click();
  await page.getByText('Regar as plantas', { exact: true }).locator('visible=true').click();
  await expect(page.getByRole('heading', { name: 'Regar as plantas' })).toBeVisible();
  const detail = new URL(page.url()).pathname;

  await page.goto('/groups/new');
  await page.getByLabel('Nome do grupo').fill('Casa de todos');
  await button(page, 'Criar grupo').click();
  await expect(page.getByRole('heading', { name: 'Membros' })).toBeVisible();
  const group = new URL(page.url()).pathname;

  for (const path of [detail, '/tasks/new', '/contexts', '/groups', group]) {
    // Opening by address is a first load of the app; the reload is what a person does when stuck.
    await page.goto(path);
    await page.reload();
    const back = page.getByRole('button', { name: 'Voltar', exact: true });
    await expect(back, path).toBeVisible();
    const box = await back.boundingBox();
    expect(box?.width, path).toBeGreaterThanOrEqual(44);
    expect(box?.height, path).toBeGreaterThanOrEqual(44);
    // The stack header used to render an empty <h1> for its blank title.
    await expect(page.locator('h1:empty'), path).toHaveCount(0);
    await back.click();
    await expect(hoje(page), path).toBeVisible();
  }
});

test('an unknown address shows a themed page in Portuguese with a way home', async ({ page }) => {
  await signUp(page, 'Perdido');
  await page.goto('/isto-nao-existe');
  await expect(page.getByRole('heading', { name: 'Página não encontrada' })).toBeVisible();
  await expect(page.getByText('Unmatched Route')).toHaveCount(0);
  // The default screen has a black background in the light theme
  await expect(page.locator('#root > div').first()).not.toHaveCSS(
    'background-color',
    'rgb(0, 0, 0)',
  );
  await button(page, 'Ir para Hoje').click();
  await expect(hoje(page)).toBeVisible();
});

test('the document is in Portuguese', async ({ page }) => {
  await page.goto('/welcome');
  await expect(page.locator('html')).toHaveAttribute('lang', 'pt-BR');
});
