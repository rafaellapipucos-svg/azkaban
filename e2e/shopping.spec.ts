import { expect, test, type Page } from '@playwright/test';
import { button, groupWithMember, newUser, signUp, text, uniqueTitle } from './proof-fixtures';

// Needs `pnpm db:start`. Two members of one group on two browsers, against the real Realtime of the
// local stack (ADR-0011, section 7), and someone from another group who must see none of it.

const stepper = (page: Page, name: string) => page.getByRole('group', { name, exact: true });
const plus = (page: Page, name: string) =>
  page.getByRole('button', { name: `Aumentar: ${name}`, exact: true });
const mode = (page: Page, name: 'Montar' | 'No mercado') =>
  page.getByRole('radio', { name, exact: true }).click();

test('two members build, shop and complete one list live; no outsider or admin sees private lists', async ({
  browser,
}) => {
  const { ownerPage, memberPage } = await groupWithMember(browser);
  const listName = uniqueTitle('Mercado');
  const typed = uniqueTitle('Pilhas especiais');

  // Sharing falls back to the clipboard, which the test reads back.
  await ownerPage.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await ownerPage.addInitScript(() =>
    Object.defineProperty(Navigator.prototype, 'share', { value: undefined, configurable: true }),
  );

  // The owner opens a group list from the Compras tab
  await ownerPage.goto('/');
  await ownerPage.getByRole('tab', { name: 'Compras' }).click();
  await ownerPage.getByRole('radio', { name: 'Equipe P' }).click();
  await ownerPage.getByLabel('Nome da nova lista').fill(listName);
  await button(ownerPage, 'Criar lista').click();
  await expect(ownerPage).toHaveURL(/\/shopping\/[0-9a-f-]{36}\?mode=build$/);
  const listUrl = new URL(ownerPage.url()).pathname;
  await expect(stepper(ownerPage, 'Arroz').getByText('0 pacote', { exact: true })).toBeVisible();

  // The member opens the same list
  await memberPage.goto(listUrl);
  await expect(memberPage.getByRole('heading', { name: listName })).toBeVisible();
  await expect(stepper(memberPage, 'Arroz').getByText('0 pacote', { exact: true })).toBeVisible();

  // Both tap the stepper at the same time: 2 + 3, and neither tap is lost
  await Promise.all([
    (async () => {
      for (let tap = 0; tap < 2; tap++) await plus(ownerPage, 'Arroz').click();
    })(),
    (async () => {
      for (let tap = 0; tap < 3; tap++) await plus(memberPage, 'Arroz').click();
    })(),
  ]);
  await expect(stepper(ownerPage, 'Arroz').getByText('5 pacotes')).toBeVisible();
  await expect(stepper(memberPage, 'Arroz').getByText('5 pacotes')).toBeVisible();

  // An item outside the catalog, added and saved to the catalog by the owner, reaches the member live
  await ownerPage.getByLabel('Buscar no catálogo').fill(typed);
  await ownerPage.getByRole('switch', { name: 'Salvar no catálogo' }).click();
  await button(ownerPage, 'Adicionar à lista').click();
  await expect(stepper(ownerPage, typed).getByText('1 un.')).toBeVisible();
  await expect(stepper(memberPage, typed).getByText('1 un.')).toBeVisible();

  // The member, without shopping.manage_catalog, may add a typed item but not save it to the catalog
  await memberPage.getByLabel('Buscar no catálogo').fill('Pilhas comuns');
  await expect(button(memberPage, 'Adicionar à lista')).toBeVisible();
  await expect(memberPage.getByRole('switch', { name: 'Salvar no catálogo' })).toHaveCount(0);
  await memberPage.getByLabel('Buscar no catálogo').fill('');

  // At the store: the member checks the rice, and the owner sees it checked live
  await mode(memberPage, 'No mercado');
  await mode(ownerPage, 'No mercado');
  await expect(memberPage.getByText('Faltam 2 itens')).toBeVisible();
  // Who added each item, by name
  await expect(memberPage.getByText('1 un. · Adicionado por Dona', { exact: true })).toBeVisible();
  await memberPage.getByRole('checkbox', { name: 'Arroz, 5 pacotes' }).click();
  await expect(ownerPage.getByRole('checkbox', { name: 'Arroz, 5 pacotes' })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  await expect(ownerPage.getByText('Falta 1 item')).toBeVisible();

  // Sharing copies only what is still to buy
  await button(ownerPage, 'Compartilhar').click();
  await expect(text(ownerPage, 'Lista copiada. Cole no WhatsApp ou onde quiser.')).toBeVisible();
  const shared = await ownerPage.evaluate<string>('navigator.clipboard.readText()');
  expect(shared).toContain(typed);
  expect(shared).not.toContain('Arroz');

  // The owner completes it; the member's screen turns to history live
  await button(ownerPage, 'Finalizar compra').click();
  await button(ownerPage, 'Confirmar: finalizar').click();
  await expect(ownerPage.getByText(/^Finalizada em /)).toBeVisible();
  await expect(memberPage.getByText(/^Finalizada em /)).toBeVisible();
  await expect(memberPage.getByRole('checkbox', { name: 'Arroz, 5 pacotes' })).toBeDisabled();

  // History, and a new list from this one, with the items unchecked
  await button(ownerPage, 'Voltar').click();
  await ownerPage.getByRole('radio', { name: 'Equipe P' }).click();
  await expect(ownerPage.getByRole('button', { name: listName })).toHaveCount(0);
  // The typed item is in the group's catalog now
  await button(ownerPage, 'Editar catálogo').click();
  await expect(ownerPage.getByRole('button', { name: new RegExp(typed) })).toBeVisible();
  await button(ownerPage, 'Voltar').click();
  await ownerPage.getByRole('radio', { name: 'Equipe P' }).click();
  await button(ownerPage, 'Histórico').click();
  await ownerPage.getByRole('button', { name: new RegExp(listName) }).click();
  await button(ownerPage, 'Nova lista a partir desta').click();
  await expect(ownerPage).toHaveURL(/\?mode=build$/);
  expect(new URL(ownerPage.url()).pathname).not.toBe(listUrl);
  await expect(stepper(ownerPage, 'Arroz').getByText('5 pacotes')).toBeVisible();
  await mode(ownerPage, 'No mercado');
  await expect(ownerPage.getByText('Faltam 2 itens')).toBeVisible();

  // Someone from another group finds neither the list nor the group
  const outsiderPage = await (await browser.newContext()).newPage();
  await signUp(outsiderPage, newUser('Fora'));
  await expect(outsiderPage.getByRole('heading', { name: 'Hoje', exact: true })).toBeVisible();
  await outsiderPage.goto('/groups/new');
  await outsiderPage.getByLabel('Nome do grupo').fill('Outra casa');
  await button(outsiderPage, 'Criar grupo').click();
  await expect(button(outsiderPage, 'Convidar membro')).toBeVisible();
  await outsiderPage.goto(listUrl);
  await expect(
    outsiderPage.getByText('Lista não encontrada. Ela pode ter sido excluída.'),
  ).toBeVisible();
  await outsiderPage.goto('/shopping');
  await expect(outsiderPage.getByRole('radio', { name: 'Equipe P' })).toHaveCount(0);
  await outsiderPage.getByRole('radio', { name: 'Outra casa' }).click();
  await expect(outsiderPage.getByText('Nenhuma lista aberta por aqui.')).toBeVisible();
  await button(outsiderPage, 'Histórico').click();
  await expect(outsiderPage.getByText('Nenhuma compra finalizada ainda.')).toBeVisible();
  await expect(outsiderPage.getByText(listName)).toHaveCount(0);

  // The member's personal list, where they may save to their own catalog, is hidden from the group owner
  const personal = uniqueTitle('Farmácia');
  await memberPage.goto('/shopping');
  await memberPage.getByRole('radio', { name: 'Pessoal' }).click();
  await memberPage.getByLabel('Nome da nova lista').fill(personal);
  await button(memberPage, 'Criar lista').click();
  await expect(memberPage).toHaveURL(/\/shopping\/[0-9a-f-]{36}\?mode=build$/);
  const personalUrl = new URL(memberPage.url()).pathname;
  await memberPage.getByLabel('Buscar no catálogo').fill('Pomada');
  await expect(memberPage.getByRole('switch', { name: 'Salvar no catálogo' })).toBeVisible();
  await ownerPage.goto(personalUrl);
  await expect(
    ownerPage.getByText('Lista não encontrada. Ela pode ter sido excluída.'),
  ).toBeVisible();
  await ownerPage.goto('/shopping');
  await ownerPage.getByRole('radio', { name: 'Pessoal' }).click();
  await expect(ownerPage.getByText('Nenhuma lista aberta por aqui.')).toBeVisible();
  await expect(ownerPage.getByText(personal)).toHaveCount(0);
});
