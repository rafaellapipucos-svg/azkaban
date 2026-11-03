import { randomUUID } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';

// Needs `pnpm db:start`. Accounts are unique per run and exist only in the local database.
const newUser = (name: string) => ({
  name,
  email: `${name.toLowerCase()}-${randomUUID()}@example.com`,
  password: randomUUID(),
});

type User = ReturnType<typeof newUser>;

const button = (page: Page, name: string) =>
  page.getByRole('button', { name, exact: true }).locator('visible=true');

async function fillSignUp(page: Page, user: User) {
  await page.getByLabel('Seu nome').fill(user.name);
  await page.getByLabel('E-mail', { exact: true }).fill(user.email);
  await page.getByLabel('Senha').fill(user.password);
  await button(page, 'Criar conta').first().click();
}

async function openTab(page: Page, name: string) {
  await page.getByRole('tab', { name }).or(page.getByRole('link', { name })).first().click();
}

test('signed-out visitors land on the welcome screen', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('Tudo em ordem, todo dia')).toBeVisible();
  await page.goto('/groups');
  await expect(page.getByText('Tudo em ordem, todo dia')).toBeVisible();
});

test('sign up, sign out and sign back in', async ({ page }) => {
  const user = newUser('Solo');
  await page.goto('/');
  await button(page, 'Começar').click();
  await fillSignUp(page, user);
  await expect(button(page, 'Novo contexto')).toBeVisible();

  await openTab(page, 'Perfil');
  await expect(page.getByLabel('Seu nome')).toHaveValue(user.name);
  await button(page, 'Sair').click();
  await expect(page.getByText('Tudo em ordem, todo dia')).toBeVisible();

  await button(page, 'Já tenho conta').click();
  await page.getByLabel('E-mail', { exact: true }).fill(user.email);
  await page.getByLabel('Senha').fill('wrong-password');
  await button(page, 'Entrar').click();
  await expect(page.getByText('E-mail ou senha incorretos.')).toBeVisible();

  await page.getByLabel('Senha').fill(user.password);
  await button(page, 'Entrar').click();
  await expect(button(page, 'Novo contexto')).toBeVisible();
});

test('invite flow keeps personal contexts private', async ({ browser }) => {
  const owner = newUser('Dona');
  const member = newUser('Duda');
  const ownerPage = await (await browser.newContext()).newPage();
  const memberPage = await (await browser.newContext()).newPage();

  await ownerPage.goto('/sign-up');
  await fillSignUp(ownerPage, owner);
  await expect(button(ownerPage, 'Novo contexto')).toBeVisible();

  // A personal context and a group context, as the owner
  await button(ownerPage, 'Novo contexto').click();
  await ownerPage.getByLabel('Nome', { exact: true }).fill('Diário secreto');
  await button(ownerPage, 'Salvar').click();
  await expect(ownerPage.getByText('Diário secreto').first()).toBeVisible();

  await openTab(ownerPage, 'Grupos');
  await button(ownerPage, 'Criar grupo').click();
  await ownerPage.getByLabel('Nome do grupo').fill('Casa A');
  await button(ownerPage, 'Criar grupo').click();
  await expect(ownerPage.getByText('Dono', { exact: true })).toBeVisible();

  await button(ownerPage, 'Convidar membro').click();
  const code = await ownerPage.getByRole('heading', { name: /^[A-Z2-9]{10}$/ }).innerText();

  await ownerPage.goto('/contexts/new');
  await ownerPage.getByLabel('Nome', { exact: true }).fill('Cozinha');
  await ownerPage.getByRole('radio', { name: 'Casa A' }).click();
  await button(ownerPage, 'Salvar').click();
  await expect(ownerPage.getByText('Cozinha').first()).toBeVisible();

  // The invitee arrives through the link without an account
  await memberPage.goto(`/join/${code}`);
  await button(memberPage, 'Entrar').click();
  await button(memberPage, 'Criar conta').click();
  await fillSignUp(memberPage, member);
  await expect(memberPage.getByText('Você foi convidado para Casa A como Membro.')).toBeVisible();
  await button(memberPage, 'Aceitar').click();
  await expect(memberPage.getByText('Dona')).toBeVisible();

  // Members do not get management controls
  await expect(button(memberPage, 'Convidar membro')).toHaveCount(0);
  await expect(button(memberPage, 'Excluir grupo')).toHaveCount(0);
  await expect(button(memberPage, 'Sair do grupo')).toBeVisible();

  // Group context is shared, the owner's personal one is not
  await memberPage.goto('/');
  await memberPage.getByRole('radio', { name: /Doméstico/ }).click();
  await memberPage.getByRole('radio', { name: /Trabalho/ }).click();
  await expect(memberPage.getByText('Diário secreto')).toHaveCount(0);
  await expect(memberPage.getByText('Grupo: Casa A')).toBeVisible();

  // The same code cannot be used after being revoked
  await ownerPage.goto('/groups');
  await ownerPage.getByText('Casa A').first().click();
  await expect(ownerPage.getByText('Duda')).toBeVisible();
  await button(ownerPage, 'Cancelar convite').click();
  await button(ownerPage, 'Confirmar cancelamento').click();
  await expect(ownerPage.getByText('Nenhum convite ativo.')).toBeVisible();
  await memberPage.goto(`/join/${code}`);
  await expect(memberPage.getByText('Este convite não vale mais.', { exact: false })).toBeVisible();
});

test('magic link signs the user in', async ({ page, request }) => {
  const user = newUser('Link');
  await page.goto('/sign-in');
  await page.getByLabel('E-mail', { exact: true }).fill(user.email);
  await button(page, 'Receber link por e-mail').click();
  await expect(page.getByText('Enviamos um link para o seu e-mail.')).toBeVisible();

  const mail = 'http://127.0.0.1:54324/api/v1';
  await expect
    .poll(async () => {
      const search = await request.get(`${mail}/search?query=to:${user.email}`);
      return (await search.json()).messages_count;
    })
    .toBeGreaterThan(0);
  const search = await (await request.get(`${mail}/search?query=to:${user.email}`)).json();
  const message = await (await request.get(`${mail}/message/${search.messages[0].ID}`)).json();
  const link = message.Text.match(/https?:\/\/\S+/)[0];

  await page.goto(link);
  await expect(button(page, 'Novo contexto')).toBeVisible();
});
