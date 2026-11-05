import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import {
  button,
  contains,
  groupWithMember,
  newUser,
  signUp,
  signUpWithContext,
  text,
  uniqueTitle,
} from './proof-fixtures';

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
  await expect(stepper(ownerPage, 'Arroz').getByText('0 pacotes', { exact: true })).toBeVisible();

  // The member opens the same list
  await memberPage.goto(listUrl);
  await expect(memberPage.getByRole('heading', { name: listName })).toBeVisible();
  await expect(stepper(memberPage, 'Arroz').getByText('0 pacotes', { exact: true })).toBeVisible();

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

test('whoever manages a list renames and deletes it; a member writes a note on an item', async ({
  browser,
}) => {
  const { ownerPage, memberPage } = await groupWithMember(browser);
  const listName = uniqueTitle('Feira');
  const renamed = uniqueTitle('Sacolão');

  await ownerPage.goto('/shopping');
  await ownerPage.getByRole('radio', { name: 'Equipe P' }).click();
  await ownerPage.getByLabel('Nome da nova lista').fill(listName);
  await button(ownerPage, 'Criar lista').click();
  await expect(ownerPage).toHaveURL(/\/shopping\/[0-9a-f-]{36}\?mode=build$/);
  const listUrl = new URL(ownerPage.url()).pathname;
  // An empty list says so, never "Falta 0 item"
  await expect(ownerPage.getByRole('status').getByText('A lista está vazia.')).toBeVisible();

  // The member, who neither created the list nor has shopping.manage_lists, is not offered either
  await memberPage.goto(listUrl);
  await expect(memberPage.getByRole('heading', { name: listName })).toBeVisible();
  await expect(button(memberPage, 'Renomear lista')).toHaveCount(0);
  await expect(button(memberPage, 'Excluir lista')).toHaveCount(0);

  // A note on an item, written by the member, shown at the store to both
  await plus(memberPage, 'Arroz').click();
  await expect(stepper(memberPage, 'Arroz').getByText('1 pacote')).toBeVisible();
  await button(memberPage, 'Nota de Arroz').click();
  await memberPage.getByRole('textbox', { name: 'Nota de Arroz' }).fill('Integral');
  await button(memberPage, 'Salvar nota').click();
  await expect(text(memberPage, 'Integral')).toBeVisible();
  await mode(ownerPage, 'No mercado');
  await expect(text(ownerPage, '1 pacote · Integral · Adicionado por Duda')).toBeVisible();

  // The creator renames it, and the member sees the new name live
  await button(ownerPage, 'Renomear lista').click();
  await ownerPage.getByLabel('Nome da lista').fill(renamed);
  await button(ownerPage, 'Salvar nome').click();
  await expect(ownerPage.getByRole('heading', { name: renamed })).toBeVisible();
  await expect(memberPage.getByRole('heading', { name: renamed })).toBeVisible();

  // Deleting asks to confirm, leaves for the lists and takes the list from the member too
  await button(ownerPage, 'Excluir lista').click();
  await button(ownerPage, 'Confirmar: excluir').click();
  await expect(ownerPage).toHaveURL(/\/shopping$/);
  await ownerPage.getByRole('radio', { name: 'Equipe P' }).click();
  await expect(ownerPage.getByRole('button', { name: renamed })).toHaveCount(0);
  await expect(
    memberPage.getByText('Lista não encontrada. Ela pode ter sido excluída.'),
  ).toBeVisible();
});

// The queue as saved in the browser's storage, read from outside the page.
const savedQueue = async (context: BrowserContext) =>
  (await context.storageState()).origins
    .flatMap(({ localStorage }) => localStorage)
    .filter(({ name }) => name.startsWith('azkaban.offline-queue.'))
    .map(({ value }) => value)
    .join('');

// Needs the root layout running `useOfflineQueue` (ADR-0012, section 5), like offline-queue.spec.ts.
test('stepper taps and a check made offline survive closing the tab and count once', async ({
  context,
  page,
}) => {
  await signUpWithContext(page, 'Feirante');
  const listName = uniqueTitle('Quitanda');
  await page.goto('/shopping');
  await page.getByLabel('Nome da nova lista').fill(listName);
  await button(page, 'Criar lista').click();
  await expect(page).toHaveURL(/\/shopping\/[0-9a-f-]{36}\?mode=build$/);
  const listUrl = new URL(page.url()).pathname;
  // The item is on the list before the connection goes, so the taps go by its id.
  const added = page.waitForResponse('**/rest/v1/rpc/add_catalog_item_to_list');
  await plus(page, 'Arroz').click();
  expect((await added).status()).toBe(200);
  await expect(stepper(page, 'Arroz').getByText('1 pacote', { exact: true })).toBeVisible();

  // Offline: three taps and a check wait on the disk, shown at once; completing waits for the network
  await context.setOffline(true);
  for (let tap = 0; tap < 3; tap++) await plus(page, 'Arroz').click();
  await expect(stepper(page, 'Arroz').getByText('4 pacotes')).toBeVisible();
  await expect.poll(() => savedQueue(context)).toContain('shopping-adjust');
  await mode(page, 'No mercado');
  await page.getByRole('checkbox', { name: 'Arroz, 1 pacote' }).click();
  await expect.poll(() => savedQueue(context)).toContain('shopping-check');
  await expect(
    page.getByText('Sem conexão: 2 alterações serão enviadas quando a internet voltar.'),
  ).toBeVisible();
  await expect(button(page, 'Finalizar compra')).toBeDisabled();
  await expect(page.getByText(/^Sem conexão. Finalizar espera a internet voltar/)).toBeVisible();

  // The tab closes before the connection returns; a new one sends what waited, in order.
  // `close` drops the DevTools session first, and with it the offline emulation: a slow runner's
  // dying tab came back online and sent the adjust unseen (CI run 42107062041). Leaving the app
  // still offline closes it for good, with the whole queue on the disk.
  await page.goto('about:blank');
  await page.close();
  await context.setOffline(false);
  const next = await context.newPage();
  // This wait spans the new tab's whole cold start (load, bundle, session, restore) before the queue
  // sends, under a second here and over the 30 s action limit on a slow CI runner: the navigation's 60 s.
  const stepped = next.waitForResponse('**/rest/v1/rpc/adjust_shopping_item_quantity', {
    timeout: 60_000,
  });
  await next.goto(`${listUrl}?mode=market`);
  expect((await stepped).status()).toBe(200);
  await expect.poll(() => savedQueue(context)).not.toContain('shopping-');

  // Read again from scratch: one plus three, once, and checked
  await next.reload();
  await expect(next.getByRole('checkbox', { name: 'Arroz, 4 pacotes' })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  await mode(next, 'Montar');
  await expect(stepper(next, 'Arroz').getByText('4 pacotes', { exact: true })).toBeVisible();
});

// BL-18: completing gives XP and is never queued. A confirm armed before the connection drops
// does not stay armed: offline it is the plain, disabled button, and back online it asks again.
test('an armed "Finalizar compra" disarms and disables when the connection drops', async ({
  context,
  page,
}) => {
  const offlineNote = /^Sem conexão. Finalizar espera a internet voltar/;
  await signUpWithContext(page, 'Feirante');
  await page.goto('/shopping');
  await page.getByLabel('Nome da nova lista').fill(uniqueTitle('Padaria'));
  await button(page, 'Criar lista').click();
  await expect(page).toHaveURL(/\/shopping\/[0-9a-f-]{36}\?mode=build$/);

  await button(page, 'Finalizar compra').click();
  await expect(button(page, 'Confirmar: finalizar')).toBeEnabled();

  await context.setOffline(true);
  await expect(button(page, 'Confirmar: finalizar')).toHaveCount(0);
  await expect(button(page, 'Finalizar compra')).toBeDisabled();
  await expect(page.getByText(offlineNote)).toBeVisible();

  await context.setOffline(false);
  await expect(button(page, 'Finalizar compra')).toBeEnabled();
  await expect(button(page, 'Confirmar: finalizar')).toHaveCount(0);
  await expect(page.getByText(offlineNote)).toHaveCount(0);
});

test('a list made from a task links both ways; a member who cannot read the task sees no link', async ({
  browser,
}) => {
  const { ownerPage, memberPage } = await groupWithMember(browser);
  const title = uniqueTitle('Fazer compras');

  // The owner's task in the group, seen by the whole group
  await ownerPage.goto('/');
  await button(ownerPage, 'Nova tarefa').click();
  await ownerPage.getByLabel('O que precisa ser feito?').fill(title);
  await button(ownerPage, 'Criar').click();
  await ownerPage.getByText(title, { exact: true }).locator('visible=true').click();
  await expect(ownerPage).toHaveURL(/\/tasks\/[0-9a-f-]{36}$/);
  const taskUrl = new URL(ownerPage.url()).pathname;

  // From the task, a list named after it, linked back to it
  await button(ownerPage, 'Criar lista de compras').click();
  await expect(ownerPage).toHaveURL(/\/shopping\/[0-9a-f-]{36}\?mode=build$/);
  const listUrl = new URL(ownerPage.url()).pathname;
  await expect(ownerPage.getByRole('heading', { name: title })).toBeVisible();
  await button(ownerPage, `Abrir a tarefa: ${title}`).click();
  await expect(ownerPage).toHaveURL(new RegExp(`${taskUrl}$`));
  await button(ownerPage, `Abrir a lista de compras: ${title}`).click();
  await expect(ownerPage).toHaveURL(new RegExp(`${listUrl}$`));

  // The member sees the list but not the task (no task.view_group): no link, never "not found"
  await memberPage.goto(listUrl);
  await expect(memberPage.getByRole('heading', { name: title })).toBeVisible();
  await plus(memberPage, 'Arroz').click();
  await expect(stepper(memberPage, 'Arroz').getByText('1 pacote', { exact: true })).toBeVisible();
  await expect(memberPage.getByRole('button', { name: /^Abrir a tarefa/ })).toHaveCount(0);
  await expect(memberPage.getByText(/não encontrad/)).toHaveCount(0);

  // Completing with fewer than three items checked says there is no XP, and the task is still offered.
  // The owner's stack holds the list twice (list > task > list): only the one on top counts.
  await expect(
    text(ownerPage, 'Com menos de 3 itens marcados, a compra finaliza sem XP.'),
  ).toBeVisible();
  await button(ownerPage, 'Finalizar compra').click();
  await button(ownerPage, 'Confirmar: finalizar').click();
  await expect(contains(ownerPage, /^Finalizada em /)).toBeVisible();
  await expect(button(ownerPage, `Abrir a tarefa: ${title}`)).toBeVisible();
  await expect(memberPage.getByText(/^Finalizada em /)).toBeVisible();
  await expect(memberPage.getByRole('button', { name: /^Abrir a tarefa/ })).toHaveCount(0);
});
