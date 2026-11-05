import { randomUUID } from 'node:crypto';
import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

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

// Grupos left the tab bar: it is reached from Perfil.
async function openGroups(page: Page) {
  await openTab(page, 'Perfil');
  await button(page, 'Grupos').click();
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
  // Hoje is the start screen, and without a context it offers to create one
  await expect(page.getByRole('heading', { name: 'Hoje', exact: true })).toBeVisible();
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
  await openTab(ownerPage, 'Trabalho');
  await expect(ownerPage.getByText('Diário secreto').first()).toBeVisible();

  await openGroups(ownerPage);
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
  await openTab(ownerPage, 'Trabalho');
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
  await memberPage.goto('/contexts');
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

// BL-15: the invite preview names a server down and a missing connection, and offers to try again.
// The route answers before the database, so no try spends the invite limit.
test('the invite preview says when the server is down or the connection failed', async ({
  page,
}) => {
  await page.goto('/sign-up');
  await fillSignUp(page, newUser('Anfitria'));
  await expect(button(page, 'Novo contexto')).toBeVisible();
  await openGroups(page);
  await button(page, 'Criar grupo').click();
  await page.getByLabel('Nome do grupo').fill('Casa B');
  await button(page, 'Criar grupo').click();
  await button(page, 'Convidar membro').click();
  const code = await page.getByRole('heading', { name: /^[A-Z2-9]{10}$/ }).innerText();

  const preview = '**/rest/v1/rpc/get_invite_preview';
  await page.route(preview, (route) =>
    route.fulfill({ status: 502, contentType: 'text/plain', body: 'Bad Gateway' }),
  );
  await page.goto(`/join/${code}`);
  await expect(
    page.getByText(/^Não deu para abrir o convite agora: o serviço está fora do ar/),
  ).toBeVisible();

  await page.unroute(preview);
  await page.route(preview, (route) => route.abort('internetdisconnected'));
  await button(page, 'Tentar de novo').click();
  await expect(page.getByText(/^Sem conexão para abrir o convite/)).toBeVisible();

  await page.unroute(preview);
  await button(page, 'Tentar de novo').click();
  await expect(page.getByText('Você foi convidado para Casa B como Membro.')).toBeVisible();
});

const mail = 'http://127.0.0.1:54424/api/v1';

async function mailCount(request: APIRequestContext, email: string): Promise<number> {
  const search = await request.get(`${mail}/search?query=to:${email}`);
  return (await search.json()).messages_count;
}

/** Asks for a sign-in link on the sign-in screen of `page` and reads it from the local mailbox. */
async function requestLink(page: Page, request: APIRequestContext, email: string): Promise<string> {
  const before = await mailCount(request, email);
  await page.goto('/sign-in');
  await page.getByLabel('E-mail', { exact: true }).fill(email);
  await button(page, 'Receber link por e-mail').click();
  await expect(page.getByText('Enviamos um link para o seu e-mail.')).toBeVisible();
  await expect.poll(() => mailCount(request, email)).toBeGreaterThan(before);
  // Newest first.
  const search = await (await request.get(`${mail}/search?query=to:${email}`)).json();
  const message = await (await request.get(`${mail}/message/${search.messages[0].ID}`)).json();
  return message.Text.match(/https?:\/\/\S+/)[0];
}

async function signUp(page: Page, user: User) {
  await page.goto('/sign-up');
  await fillSignUp(page, user);
  await expect(button(page, 'Novo contexto')).toBeVisible();
}

const otherAccountNotice = /^O link de entrada não foi usado porque já há uma conta conectada/;

test('magic link signs the user in', async ({ page, request }) => {
  await page.goto(await requestLink(page, request, newUser('Link').email));
  await expect(button(page, 'Novo contexto')).toBeVisible();
});

// BL-38, option A' (ADR-0004): on the web a link never replaces the session of another account.
// The link is asked for in another browser, as someone else's would be, and opened in A's tab.
test('a link of another account keeps the signed-in account', async ({
  page,
  browser,
  request,
}) => {
  const owner = newUser('Alma');
  await signUp(page, owner);

  const elsewhere = await (await browser.newContext()).newPage();
  await page.goto(await requestLink(elsewhere, request, newUser('Bia').email));

  await expect(page).toHaveURL(/\/profile\?link=other-account$/);
  await expect(page.getByText(otherAccountNotice)).toBeVisible();
  await expect(page.getByLabel('Seu nome')).toHaveValue(owner.name);
  expect(page.url()).not.toContain('access_token');
});

test('a link of the same account keeps the session without the notice', async ({
  page,
  browser,
  request,
}) => {
  const owner = newUser('Alma');
  await signUp(page, owner);

  const elsewhere = await (await browser.newContext()).newPage();
  await page.goto(await requestLink(elsewhere, request, owner.email));

  await expect(button(page, 'Novo contexto')).toBeVisible();
  expect(page.url()).not.toContain('access_token');
  expect(page.url()).not.toContain('other-account');
  await openTab(page, 'Perfil');
  await expect(page.getByLabel('Seu nome')).toHaveValue(owner.name);
  await expect(page.getByText(otherAccountNotice)).toHaveCount(0);
});
