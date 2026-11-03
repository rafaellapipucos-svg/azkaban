import { expect, test, type Page } from '@playwright/test';
import { button, groupWithMember, text, uniqueTitle } from './proof-fixtures';
import { SIZES, walk } from './walk';

// Needs `pnpm db:start`. Every shopping screen at 320, 375 and 1280 px, light and dark (see walk.ts),
// the six-tab bar at each width, a title per screen, the errors of the contract, and no sample data.

/** Every tab at least 44 px, each label inside its own tab, and no two tabs overlapping. */
async function tabBarFits(page: Page) {
  for (const width of SIZES) {
    await page.setViewportSize({ width, height: 800 });
    const report = await page.locator('[role="tablist"]').evaluate((bar) => {
      const tabs = [...bar.querySelectorAll('[role="tab"]')].map((tab) => {
        const box = tab.getBoundingClientRect();
        const label = [...tab.querySelectorAll('div, span')].find(
          (el) => el.textContent === tab.getAttribute('aria-label'),
        )!;
        const range = bar.ownerDocument.createRange();
        range.selectNodeContents(label);
        return { name: tab.getAttribute('aria-label')!, box, text: range.getBoundingClientRect() };
      });
      const problems = tabs.flatMap(({ name, box, text }, index) => [
        ...(box.width < 44 || box.height < 44 ? [`${name} ${box.width}x${box.height}`] : []),
        ...(text.left < box.left - 0.5 || text.right > box.right + 0.5
          ? [`${name} label out`]
          : []),
        ...(index > 0 && tabs[index - 1]!.text.right > text.left ? [`${name} overlaps`] : []),
      ]);
      return { count: tabs.length, problems };
    });
    expect(report.count, `${width} px`).toBe(6);
    expect(report.problems, `${width} px`).toEqual([]);
  }
  await page.setViewportSize({ width: 412, height: 839 });
}

test('the shopping screens fit every size and scheme, with titles, errors and no sample data', async ({
  browser,
}) => {
  const { ownerPage: page, memberPage } = await groupWithMember(browser);
  const listName = uniqueTitle('Feira');

  // A new member has nothing yet: no sample list in either scope, nor in the history
  await memberPage.goto('/');
  await memberPage.getByRole('tab', { name: 'Compras' }).click();
  await expect(memberPage).toHaveTitle(/^Compras · /);
  await expect(memberPage.getByText('Nenhuma lista aberta por aqui.')).toBeVisible();
  await memberPage.getByRole('radio', { name: 'Equipe P' }).click();
  await expect(memberPage.getByText('Nenhuma lista aberta por aqui.')).toBeVisible();
  await button(memberPage, 'Histórico').click();
  await expect(memberPage).toHaveTitle(/^Histórico de compras · /);
  await expect(memberPage.getByText('Nenhuma compra finalizada ainda.')).toBeVisible();

  // Lists, with the tab bar
  await page.goto('/');
  await page.getByRole('tab', { name: 'Compras' }).click();
  await expect(page).toHaveTitle(/^Compras · /);
  await page.getByRole('radio', { name: 'Equipe P' }).click();
  await expect(page.getByText('Nenhuma lista aberta por aqui.')).toBeVisible();
  await walk(page, 'lists');
  await tabBarFits(page);

  // Catalog, and a rename onto a name already there
  await button(page, 'Editar catálogo').click();
  await expect(page).toHaveTitle(/^Catálogo de compras · /);
  const catalogUrl = new URL(page.url());
  await walk(page, 'catalog');
  await page.getByRole('button', { name: /Feijão/ }).click();
  await page.getByLabel('Nome do item').fill('Arroz');
  await button(page, 'Salvar').click();
  await expect(text(page, 'Já existe um item com esse nome no catálogo.')).toBeVisible();
  await button(page, 'Fechar').click();
  await expect(page.getByLabel('Nome do item')).toHaveCount(0);

  // A member without shopping.manage_catalog is told so on the catalog's address
  await memberPage.goto(catalogUrl.pathname + catalogUrl.search);
  await expect(memberPage).toHaveTitle(/^Catálogo de compras · /);
  await expect(
    memberPage.getByText('Você não tem permissão para fazer isso nesta lista.'),
  ).toBeVisible();

  // Build, with a typed item open
  await page.goto('/shopping');
  await page.getByRole('radio', { name: 'Equipe P' }).click();
  await page.getByLabel('Nome da nova lista').fill(listName);
  await button(page, 'Criar lista').click();
  await expect(page).toHaveURL(/\?mode=build$/);
  await expect(page).toHaveTitle(new RegExp(`^${listName} · `));
  await page.getByRole('button', { name: 'Aumentar: Arroz', exact: true }).click();
  await expect(page.getByText('Falta 1 item')).toBeVisible();
  await walk(page, 'build');
  await page.getByLabel('Buscar no catálogo').fill(uniqueTitle('Velas'));
  await expect(page.getByRole('switch', { name: 'Salvar no catálogo' })).toBeVisible();
  await walk(page, 'build, typed item');
  await page.getByLabel('Buscar no catálogo').fill('');

  // At the store, one item checked
  await page.getByRole('radio', { name: 'No mercado', exact: true }).click();
  await page.getByRole('checkbox', { name: /^Arroz, / }).click();
  await expect(page.getByText('Tudo no carrinho!')).toBeVisible();
  await walk(page, 'market');

  // Completed, then the history
  await button(page, 'Finalizar compra').click();
  await button(page, 'Confirmar: finalizar').click();
  await expect(page.getByText(/^Finalizada em /)).toBeVisible();
  await expect(page).toHaveTitle(new RegExp(`^${listName} · `));
  await walk(page, 'completed');
  await page.goto(`/shopping/history${catalogUrl.search}`);
  await expect(page).toHaveTitle(/^Histórico de compras · /);
  await expect(page.getByRole('button', { name: new RegExp(listName) })).toBeVisible();
  await walk(page, 'history');

  // A list that is not there
  await page.goto('/shopping/00000000-0000-4000-8000-000000000000');
  await expect(page.getByText('Lista não encontrada. Ela pode ter sido excluída.')).toBeVisible();
  await expect(page).toHaveTitle(/^Compras · /);
  await walk(page, 'not found');
});
