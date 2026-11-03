import { randomUUID } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';
import { admin } from '../supabase/functions/_shared/proof-kit';
import {
  APPROVAL,
  PHOTO,
  button,
  groupWithMember,
  newUser,
  reviewProof,
  sendProof,
  signUp,
  spotOf,
  uniqueTitle,
} from './proof-fixtures';

// Needs `pnpm db:start`. The bell is written by the database (ADR-0008) and reaches the open app
// by Realtime; no push is involved here.

const bell = (page: Page, unread: number) =>
  page.getByRole('button', {
    name: unread === 0 ? 'Avisos' : `Avisos, ${unread} ${unread === 1 ? 'não lido' : 'não lidos'}`,
    exact: true,
  });

async function photoTaskForMember(owner: Page, title: string) {
  await owner.goto('/tasks/new');
  await owner.getByLabel('O que precisa ser feito?').fill(title);
  await button(owner, 'Mais opções').click();
  await owner.getByRole('switch', { name: PHOTO }).click();
  await owner.getByRole('checkbox', { name: 'Duda' }).click();
  await owner.getByRole('checkbox', { name: 'Eu' }).click();
  await owner.getByRole('switch', { name: APPROVAL }).click();
  await button(owner, 'Salvar').click();
  await expect(owner.getByRole('heading', { name: 'Hoje', exact: true })).toBeVisible();
}

/** The visible screen, without the live notice, which sits outside it and can repeat a line. */
const screen = (page: Page) => page.locator('[role="main"]:visible');

test('a photo to review rings the admin bell live, opens the review and clears in every tab', async ({
  browser,
}) => {
  const { ownerPage, memberPage } = await groupWithMember(browser);
  const title = uniqueTitle('Lavar a louça');
  await photoTaskForMember(ownerPage, title);
  const spot = await spotOf(title);
  await expect(bell(ownerPage, 0)).toBeVisible();
  const secondTab = await ownerPage.context().newPage();
  await secondTab.goto('/');
  await expect(bell(secondTab, 0)).toBeVisible();

  const proofId = await sendProof(spot.occurrenceId, spot.assigneeId);

  // Realtime: no reload, in both tabs, with a short notice that does not block the screen
  await expect(bell(ownerPage, 1)).toBeVisible();
  await expect(bell(secondTab, 1)).toBeVisible();
  await expect(
    ownerPage.getByTestId('notification-toast').getByText('Foto para revisar'),
  ).toBeVisible();
  const box = await bell(ownerPage, 1).boundingBox();
  expect(box?.width).toBeGreaterThanOrEqual(44);
  expect(box?.height).toBeGreaterThanOrEqual(44);

  await bell(ownerPage, 1).click();
  await expect(ownerPage.getByRole('heading', { name: 'Avisos', exact: true })).toBeVisible();
  await expect(ownerPage).toHaveTitle(/^Avisos · /);
  await expect(ownerPage.locator('[role="main"]:visible')).toHaveCount(1);
  await expect(screen(ownerPage).getByText('Não lido', { exact: false })).toBeVisible();
  await screen(ownerPage).getByText(title, { exact: true }).first().click();
  await expect(ownerPage).toHaveURL(new RegExp(`/proofs/${proofId}$`));
  await expect(bell(secondTab, 0)).toBeVisible();

  // The author hears about the dispute; after leaving the group the line no longer names the task
  await memberPage.goto('/');
  await expect(bell(memberPage, 0)).toBeVisible();
  await reviewProof(spot.createdBy, proofId, { dispute: 'partial', note: 'Faltou secar' });
  await expect(bell(memberPage, 1)).toBeVisible();
  await bell(memberPage, 1).click();
  await expect(screen(memberPage).getByText('Sua foto foi contestada')).toBeVisible();
  await expect(screen(memberPage).getByText(`${title} passou para Tentei.`)).toBeVisible();

  const left = await admin
    .from('group_members')
    .delete()
    .eq('group_id', spot.groupId!)
    .eq('user_id', spot.assigneeId);
  expect(left.error).toBeNull();
  await memberPage.reload();
  await expect(memberPage.getByText('Uma tarefa passou para Tentei.')).toBeVisible();
  await expect(memberPage.getByText(title)).toHaveCount(0);

  await button(memberPage, 'Marcar todos como lidos').click();
  await expect(button(memberPage, 'Marcar todos como lidos')).toHaveCount(0);
  await memberPage.goto('/');
  await expect(bell(memberPage, 0)).toBeVisible();
});

// Handoff 20261103-0554: `SUBSCRIBED` comes before the server hears the table, seconds later on a
// cold Realtime. A row written in that gap is read back when it does, and announced once.
test('a notice written right after the bell mounts rings it once, with the live notice', async ({
  page,
}) => {
  const user = newUser(`Sino${randomUUID().slice(0, 6)}`);
  await signUp(page, user);
  await expect(page.getByRole('heading', { name: 'Hoje', exact: true })).toBeVisible();
  const profile = await admin.from('profiles').select('id').eq('display_name', user.name).single();
  const userId = profile.data!.id as string;

  await page.reload();
  await expect(bell(page, 0)).toBeVisible();
  const written = await admin.from('notifications').insert({
    user_id: userId,
    type: 'occurrence_missed',
    data: { byUserId: null },
    dedupe_key: `occurrence_missed:${randomUUID()}`,
  });
  expect(written.error).toBeNull();

  const toast = page.getByTestId('notification-toast');
  await expect(bell(page, 1)).toBeVisible();
  await expect(toast.getByText('Tarefa não feita')).toBeVisible();
  await button(page, 'Fechar aviso').click();
  // A later read-back (the `ok` of a slow server, a reconnect) does not announce it again.
  await page.waitForTimeout(3_000);
  await expect(toast.getByText('Tarefa não feita')).toHaveCount(0);
  await expect(bell(page, 1)).toBeVisible();
});
