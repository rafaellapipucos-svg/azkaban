import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import { button, clientOf, groupWithMember, newUser, signUp, text } from './proof-fixtures';

// Needs `pnpm db:start` and the Edge Functions `account-export` and `account-delete` (ADR-0012,
// sections 2 and 3). Accounts are unique per run and exist only in the local database.

const today = (page: Page) => page.getByRole('heading', { name: 'Hoje', exact: true });

async function openPrivacy(page: Page) {
  await page
    .getByRole('tab', { name: 'Perfil' })
    .or(page.getByRole('link', { name: 'Perfil' }))
    .first()
    .click();
  await button(page, 'Privacidade').click();
  await expect(page.getByRole('heading', { name: 'Privacidade', exact: true })).toBeVisible();
}

// The signed-in user's id, from the session supabase-js keeps in the browser's storage, read from
// outside the page.
async function userIdOf(page: Page): Promise<string> {
  const session = (await page.context().storageState()).origins
    .flatMap(({ localStorage }) => localStorage)
    .find(({ name }) => name.endsWith('-auth-token'));
  return (JSON.parse(session?.value ?? '{}') as { user: { id: string } }).user.id;
}

test('exports the account as a JSON file named by the day', async ({ page }) => {
  await signUp(page, newUser('Exporta'));
  await expect(today(page)).toBeVisible();
  await openPrivacy(page);

  const download = page.waitForEvent('download');
  await button(page, 'Baixar meus dados').click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/^azkaban-dados-\d{4}-\d{2}-\d{2}\.json$/);
  const body = JSON.parse(await readFile(await file.path(), 'utf8'));
  expect(body).toMatchObject({ format: 'azkaban-account-export', version: 1 });
  expect(body.sections.profile[0].display_name).toBe('Exporta');
  await expect(page.getByText(/^Pronto: o arquivo azkaban-dados-/)).toBeVisible();
});

test('an owner is blocked until passing the group on, then deletes the account', async ({
  browser,
}) => {
  const { ownerPage: page } = await groupWithMember(browser);
  await page.goto('/groups/new');
  await page.getByLabel('Nome do grupo').fill('Só eu');
  await button(page, 'Criar grupo').click();
  await expect(button(page, 'Convidar membro')).toBeVisible();

  // The preview names the group with other people and offers the way to it.
  await openPrivacy(page);
  await button(page, 'Ver o que será excluído').click();
  await expect(page.getByText(/^Você é dono de grupos com outras pessoas\./)).toBeVisible();
  await expect(text(page, '2 membros')).toBeVisible();
  await expect(button(page, 'Excluir minha conta para sempre')).toHaveCount(0);

  await button(page, 'Abrir Equipe P').click();
  await button(page, 'Passar a posse').click();
  await button(page, 'Confirmar: você vira administrador').click();
  await expect(button(page, 'Passar a posse')).toHaveCount(0);
  await button(page, 'Voltar').click();

  // Back on Privacidade, the preview is read again: only the group of one is left, and it goes along.
  await expect(page.getByText(/^Estes grupos só têm você/)).toBeVisible();
  await expect(text(page, 'Só eu')).toBeVisible();
  const confirm = button(page, 'Excluir minha conta para sempre');
  await expect(confirm).toBeDisabled();
  await page.getByLabel('Digite EXCLUIR para confirmar').fill('excluir');
  await expect(confirm).toBeEnabled();
  await confirm.click();

  // Just signed up, so the sign-in is recent: the account goes and the app is back at the welcome.
  await expect(page.getByText('Tudo em ordem, todo dia')).toBeVisible();
});

test('revokes the photo proof acceptance and links to the transparency text', async ({ page }) => {
  await signUp(page, newUser('Revoga'));
  await expect(today(page)).toBeVisible();
  // `proofRules.consentVersion` of @azkaban/config.
  const { error } = await clientOf(await userIdOf(page)).rpc('record_proof_consent', {
    p_version: 2,
  });
  expect(error).toBeNull();

  await openPrivacy(page);
  await expect(page.getByText(/^Você aceitou o aviso da prova por foto em /)).toBeVisible();
  await button(page, 'Revogar o aceite').click();
  await button(page, 'Confirmar a revogação').click();
  await expect(text(page, 'Aceite revogado.')).toBeVisible();
  await expect(
    text(page, 'Você não tem um aceite ativo do aviso da prova por foto.'),
  ).toBeVisible();

  await button(page, 'O que quem administra vê').click();
  await expect(
    page.getByRole('heading', { name: 'O que quem administra vê', level: 1 }),
  ).toBeVisible();
  // The nine items of ADR-0012, section 7.
  await expect(page.getByRole('heading', { level: 2 })).toHaveCount(9);
});
