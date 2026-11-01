import { randomUUID } from 'node:crypto';
import { expect, test, type Browser, type Page } from '@playwright/test';

// Needs `pnpm db:start` and `pnpm exec supabase functions serve` (repeating tasks are materialized
// by the Edge Function). Accounts are unique per run and exist only in the local database.
const newUser = (name: string) => ({
  name,
  email: `${name.toLowerCase()}-${randomUUID()}@example.com`,
  password: randomUUID(),
});
type User = ReturnType<typeof newUser>;

const button = (page: Page, name: string) =>
  page.getByRole('button', { name, exact: true }).locator('visible=true');

async function signUp(page: Page, user: User, path = '/sign-up') {
  await page.goto(path);
  await page.getByLabel('Seu nome').fill(user.name);
  await page.getByLabel('E-mail', { exact: true }).fill(user.email);
  await page.getByLabel('Senha').fill(user.password);
  await button(page, 'Criar conta').first().click();
}

async function openTab(page: Page, name: string) {
  await page.getByRole('tab', { name }).click();
}

async function newContext(page: Page, name: string, group?: string) {
  await page.goto('/contexts/new');
  await page.getByLabel('Nome', { exact: true }).fill(name);
  if (group) await page.getByRole('radio', { name: group }).click();
  await button(page, 'Salvar').click();
  await expect(page.getByRole('heading', { name: 'Hoje', exact: true })).toBeVisible();
}

async function quickCreate(page: Page, title: string) {
  await button(page, 'Nova tarefa').click();
  await page.getByLabel('O que precisa ser feito?').fill(title);
  await button(page, 'Criar').click();
  await expect(page.getByText('Pronto! A tarefa foi criada.')).toBeVisible();
}

// Tabs keep their screens mounted, so plain text matches would also count the hidden ones.
const text = (page: Page, value: string) =>
  page.getByText(value, { exact: true }).locator('visible=true');

const check = (page: Page, title: string, status: string) =>
  page.getByRole('checkbox', { name: `${title}: ${status}` });

/** A group owner and a member, both signed in, and a group context for the owner's tasks. */
async function groupWithMember(browser: Browser) {
  const owner = newUser('Dona');
  const member = newUser('Duda');
  const ownerPage = await (await browser.newContext()).newPage();
  const memberPage = await (await browser.newContext()).newPage();

  await signUp(ownerPage, owner);
  await expect(ownerPage.getByRole('heading', { name: 'Hoje', exact: true })).toBeVisible();
  await ownerPage.goto('/groups/new');
  await ownerPage.getByLabel('Nome do grupo').fill('Equipe T');
  await button(ownerPage, 'Criar grupo').click();
  await button(ownerPage, 'Convidar membro').click();
  const code = await ownerPage.getByRole('heading', { name: /^[A-Z2-9]{10}$/ }).innerText();
  await newContext(ownerPage, 'Escritório', 'Equipe T');

  await memberPage.goto(`/join/${code}`);
  await button(memberPage, 'Entrar').click();
  await button(memberPage, 'Criar conta').click();
  await memberPage.getByLabel('Seu nome').fill(member.name);
  await memberPage.getByLabel('E-mail', { exact: true }).fill(member.email);
  await memberPage.getByLabel('Senha').fill(member.password);
  await button(memberPage, 'Criar conta').first().click();
  await button(memberPage, 'Aceitar').click();
  await expect(memberPage.getByText('Dona')).toBeVisible();
  return { ownerPage, memberPage };
}

test('quick create shows in Hoje, then green and yellow with a reason', async ({ page }) => {
  await signUp(page, newUser('Rapida'));
  await button(page, 'Novo contexto').click();
  await page.getByLabel('Nome', { exact: true }).fill('Casa');
  await button(page, 'Salvar').click();
  await expect(page.getByRole('heading', { name: 'Hoje', exact: true })).toBeVisible();

  await quickCreate(page, 'Lavar a louça');
  await expect(text(page, 'Lavar a louça')).toBeVisible();
  await expect(page.getByRole('progressbar', { name: 'Meta do dia' })).toHaveAttribute(
    'aria-valuetext',
    '0 de 1',
  );

  // Green is one tap, and the goal follows
  await check(page, 'Lavar a louça', 'Pendente').click();
  await expect(check(page, 'Lavar a louça', 'Feito')).toBeVisible();
  await expect(page.getByRole('progressbar', { name: 'Meta do dia' })).toHaveAttribute(
    'aria-valuetext',
    '1 de 1',
  );
  await expect(page.getByText('+10 XP')).toBeVisible();

  // Back to pending, then yellow, which asks for a reason
  await check(page, 'Lavar a louça', 'Feito').click();
  await expect(check(page, 'Lavar a louça', 'Pendente')).toBeVisible();
  await button(page, 'Mais opções: Lavar a louça').click();
  await button(page, 'Tentei, mas não consegui').click();
  await expect(button(page, 'Confirmar')).toBeDisabled();
  await page.getByLabel('O que aconteceu? (uma frase curta)').fill('Faltou sabão');
  await button(page, 'Confirmar').click();
  await expect(check(page, 'Lavar a louça', 'Tentei')).toBeVisible();

  // The detail keeps the history, with the reason
  await text(page, 'Lavar a louça').click();
  await expect(page.getByText('Motivo: Faltou sabão')).toBeVisible();
  await expect(page.getByText('Pendente → Tentei')).toBeVisible();
});

test('repeating task: edit only this one, delete this and the following', async ({ page }) => {
  await signUp(page, newUser('Serie'));
  await button(page, 'Novo contexto').click();
  await page.getByLabel('Nome', { exact: true }).fill('Academia X');
  await button(page, 'Salvar').click();

  // Full form, repeating every day
  await button(page, 'Nova tarefa').click();
  await page.getByLabel('O que precisa ser feito?').fill('Treino');
  await button(page, 'Mais opções').click();
  await page.getByRole('switch', { name: 'Repetir' }).click();
  await expect(page.getByText('Vai repetir: todo dia')).toBeVisible();
  await button(page, 'Salvar').click();
  await expect(text(page, 'Treino')).toBeVisible();

  // Edit only today's
  await text(page, 'Treino').click();
  await expect(page.getByText('Repete: todo dia')).toBeVisible();
  await button(page, 'Editar').click();
  await expect(page.getByText('Esta tarefa se repete. O que você quer editar?')).toBeVisible();
  await button(page, 'Só esta').click();
  await page.getByLabel('O que precisa ser feito?').fill('Treino leve');
  await button(page, 'Salvar').click();
  await expect(page.getByRole('heading', { name: 'Treino leve' })).toBeVisible();

  // The series goes on: Trabalho lists the next days, with the original name
  await page.goBack();
  await openTab(page, 'Trabalho');
  // Hoje stays mounted behind the tab, so more than one element can match
  await expect(text(page, 'Treino leve').first()).toBeVisible();
  await expect(text(page, 'Treino').first()).toBeVisible();

  // Delete from tomorrow's on: nothing of the series is left, and the detached one stays
  await text(page, 'Treino').first().click();
  await button(page, 'Excluir').click();
  await expect(page.getByText('Esta tarefa se repete. O que você quer excluir?')).toBeVisible();
  await button(page, 'Esta e as próximas').click();
  await expect(page.getByRole('tab', { name: 'Trabalho' })).toBeVisible();
  await expect(text(page, 'Treino')).toHaveCount(0);
  // Hoje stays mounted behind the tab, so more than one element can match
  await expect(text(page, 'Treino leve').first()).toBeVisible();
});

test('delete all of a repeating task asks twice', async ({ page }) => {
  await signUp(page, newUser('Tudo'));
  await button(page, 'Novo contexto').click();
  await page.getByLabel('Nome', { exact: true }).fill('Casa');
  await button(page, 'Salvar').click();
  await button(page, 'Nova tarefa').click();
  await page.getByLabel('O que precisa ser feito?').fill('Regar');
  await button(page, 'Mais opções').click();
  await page.getByRole('switch', { name: 'Repetir' }).click();
  await button(page, 'Salvar').click();
  await text(page, 'Regar').click();
  await button(page, 'Excluir').click();
  await button(page, 'Todas').click();
  await expect(text(page, 'Regar')).toBeVisible();
  await button(page, 'Sim, excluir todas (não dá para desfazer)').click();
  await expect(page.getByRole('heading', { name: 'Hoje', exact: true })).toBeVisible();
  await expect(text(page, 'Regar')).toHaveCount(0);
});

test('admin assigns to a member, who cannot edit; a personal task stays private', async ({
  browser,
}) => {
  const { ownerPage, memberPage } = await groupWithMember(browser);

  // The owner creates a task for Duda only
  await ownerPage.goto('/tasks/new');
  await ownerPage.getByLabel('O que precisa ser feito?').fill('Relatório');
  await ownerPage.getByRole('radio', { name: 'Duda' }).click();
  await ownerPage.getByRole('radio', { name: 'Eu' }).click();
  await button(ownerPage, 'Salvar').click();
  await expect(ownerPage.getByRole('heading', { name: 'Hoje', exact: true })).toBeVisible();

  // Duda sees it, and the detail has no editing controls
  await memberPage.goto('/');
  await expect(text(memberPage, 'Relatório')).toBeVisible();
  await text(memberPage, 'Relatório').click();
  await expect(button(memberPage, 'Marcar como feito')).toBeVisible();
  await expect(button(memberPage, 'Editar')).toHaveCount(0);
  await expect(button(memberPage, 'Reagendar')).toHaveCount(0);
  await expect(button(memberPage, 'Excluir')).toHaveCount(0);
  await expect(button(memberPage, 'Duplicar')).toBeVisible();
  await button(memberPage, 'Marcar como feito').click();
  await expect(memberPage.getByText('Pendente → Feito')).toBeVisible();

  // One task for each of two people, in a single step
  await ownerPage.goto('/tasks/new');
  await ownerPage.getByLabel('O que precisa ser feito?').fill('Limpeza');
  await ownerPage.getByRole('radio', { name: 'Duda' }).click();
  await expect(
    ownerPage.getByText('Uma tarefa será criada para cada uma das 2 pessoas.'),
  ).toBeVisible();
  await button(ownerPage, 'Salvar').click();
  await expect(text(ownerPage, 'Limpeza')).toBeVisible();
  await memberPage.goto('/');
  await expect(text(memberPage, 'Limpeza')).toBeVisible();

  // Duda's own task in a personal context never reaches the owner
  await newContext(memberPage, 'Meu diário');
  await memberPage.goto('/tasks/new');
  await memberPage.getByLabel('O que precisa ser feito?').fill('Segredo');
  await memberPage.getByRole('radio', { name: /Meu diário/ }).click();
  await button(memberPage, 'Salvar').click();
  await expect(text(memberPage, 'Segredo')).toBeVisible();

  await ownerPage.goto('/');
  await openTab(ownerPage, 'Trabalho');
  await ownerPage.getByRole('radio', { name: 'Do grupo' }).click();
  await expect(text(ownerPage, 'Relatório')).toBeVisible();
  await expect(ownerPage.getByText('Segredo')).toHaveCount(0);
});

test('a stale screen gets a clear message instead of overwriting', async ({ browser }) => {
  const context = await browser.newContext();
  const first = await context.newPage();
  const second = await context.newPage();
  await signUp(first, newUser('Duas'));
  await button(first, 'Novo contexto').click();
  await first.getByLabel('Nome', { exact: true }).fill('Casa');
  await button(first, 'Salvar').click();
  await quickCreate(first, 'Varrer');

  await second.goto('/');
  await expect(check(second, 'Varrer', 'Pendente')).toBeVisible();
  await check(first, 'Varrer', 'Pendente').click();
  await expect(check(first, 'Varrer', 'Feito')).toBeVisible();

  // The second screen still shows pending, so its tap carries a status that is no longer true
  await check(second, 'Varrer', 'Pendente').click();
  await expect(
    second.getByText('Outra pessoa mudou esta tarefa antes de você. Atualizamos a lista.'),
  ).toBeVisible();
  await expect(check(second, 'Varrer', 'Feito')).toBeVisible();
});
