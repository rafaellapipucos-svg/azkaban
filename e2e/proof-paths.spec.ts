import { expect, test, type Page } from '@playwright/test';
import { admin } from '../supabase/functions/_shared/proof-kit';
import {
  APPROVAL,
  PHOTO,
  button,
  check,
  clientOf,
  contains,
  groupWithMember,
  signUpWithContext,
  spotOf,
  uniqueTitle,
} from './proof-fixtures';

// The roads of a person that `proof-capture.spec.ts` does not walk: leaving the group, a red dispute,
// reopening, and a refusal that really comes from the server. Same needs and same camera as that file.
test.use({
  channel: 'chrome',
  launchOptions: { args: ['--use-fake-device-for-media-stream', '--use-angle=swiftshader'] },
});

const CONSENT = 'Aceitar e continuar';
const ACCEPTED = 'O servidor aceitou a foto, e a tarefa está feita.';
const NOT_FOUND = 'Não encontramos esta prova, ou você não tem acesso a ela.';

// A request can wait 16 s for a worker of the local runtime that is retiring, longer than the 15 s of
// the config. What is under test is the answer, not how long it took.
const answered = expect.configure({ timeout: 30_000 });
const allowCamera = (page: Page) => page.context().grantPermissions(['camera']);

async function photoTask(owner: Page, title: string, { approval = false } = {}) {
  await owner.goto('/tasks/new');
  await owner.getByLabel('O que precisa ser feito?').fill(title);
  await button(owner, 'Mais opções').click();
  await owner.getByRole('switch', { name: PHOTO }).click();
  await owner.getByRole('checkbox', { name: 'Duda' }).click();
  await owner.getByRole('checkbox', { name: 'Eu' }).click();
  if (approval) await owner.getByRole('switch', { name: APPROVAL }).click();
  await button(owner, 'Salvar').click();
  await expect(owner.getByRole('heading', { name: 'Hoje', exact: true })).toBeVisible();
}

async function sendPhoto(page: Page, occurrenceId: string, confirmation = ACCEPTED) {
  await page.goto(`/tasks/${occurrenceId}/proof`);
  const consent = button(page, CONSENT);
  const shutter = button(page, 'Tirar foto');
  await expect(consent.or(shutter)).toBeVisible();
  if (await consent.isVisible()) await consent.click();
  await expect(shutter).toBeEnabled();
  await shutter.click();
  await button(page, 'Enviar foto').click();
  await answered(page.getByText(confirmation)).toBeVisible();
}

const proofIdOf = async (occurrenceId: string) => {
  const { data } = await admin
    .from('task_occurrences')
    .select('current_proof_id')
    .eq('id', occurrenceId)
    .single();
  return data!.current_proof_id as string;
};

const statusOf = async (occurrenceId: string) => {
  const { data } = await admin
    .from('task_occurrences')
    .select('status, proof_review_status')
    .eq('id', occurrenceId)
    .single();
  return data;
};

const xpOf = async (occurrenceId: string) => {
  const { data } = await admin.from('xp_events').select('amount').eq('occurrence_id', occurrenceId);
  return data!.reduce((sum, { amount }) => sum + amount, 0);
};

test('whoever leaves the group loses the photo and the camera, and the admin still decides', async ({
  browser,
}) => {
  const { ownerPage, memberPage } = await groupWithMember(browser);
  await allowCamera(memberPage);
  const sent = uniqueTitle('Antes de sair');
  const open = uniqueTitle('Ficou aberta');
  await photoTask(ownerPage, sent, { approval: true });
  await photoTask(ownerPage, open);
  const a = await spotOf(sent);
  const b = await spotOf(open);

  await sendPhoto(
    memberPage,
    a.occurrenceId,
    'O servidor aceitou a foto. Agora um administrador confere, e o XP chega quando ele aprovar.',
  );
  const proofId = await proofIdOf(a.occurrenceId);
  await memberPage.goto(`/proofs/${proofId}`);
  await expect(memberPage.getByText('Esperando aprovação')).toBeVisible();
  // The address of the photo is the real barrier: the screen below is also empty by way of the task.
  const askPhoto = async () => {
    const { response } = await clientOf(a.assigneeId).functions.invoke('proof-url', {
      body: { proofId },
    });
    return response?.status;
  };
  expect(await askPhoto()).toBe(200);

  await ownerPage.goto(`/groups/${a.groupId}`);
  await expect(ownerPage.getByText('Duda')).toBeVisible();
  await button(ownerPage, 'Remover').click();
  await button(ownerPage, 'Confirmar: remove e cancela os convites ativos').click();
  await expect(ownerPage.getByText('Duda')).toHaveCount(0);

  // Their own photo, and the proof of a task still open, are both gone from the screens
  await memberPage.goto(`/proofs/${proofId}`);
  await expect(memberPage.getByText(NOT_FOUND)).toBeVisible();
  expect(await askPhoto()).toBe(403);
  await memberPage.goto(`/tasks/${b.occurrenceId}/proof`);
  await expect(button(memberPage, 'Tirar foto')).toHaveCount(0);
  await expect(memberPage.locator('video')).toHaveCount(0);
  await expect(button(memberPage, 'Voltar à tarefa')).toBeVisible();

  // The proof they left behind does not hang in the queue
  await ownerPage.goto(`/reviews/${a.groupId}`);
  await ownerPage.getByText(sent).click();
  await expect(ownerPage.getByText('Enviada por alguém')).toBeVisible();
  await button(ownerPage, 'Aprovar').click();
  await expect
    .poll(() => statusOf(a.occurrenceId))
    .toMatchObject({
      status: 'done',
      proof_review_status: 'approved',
    });
});

test('a red dispute takes the XP back, and the author can neither resend nor reopen', async ({
  browser,
}) => {
  const { ownerPage, memberPage } = await groupWithMember(browser);
  await allowCamera(memberPage);
  const title = uniqueTitle('Vira vermelho');
  await photoTask(ownerPage, title);
  const { occurrenceId } = await spotOf(title);

  await sendPhoto(memberPage, occurrenceId);
  await expect.poll(() => xpOf(occurrenceId)).toBeGreaterThan(0);

  // Approving a proof that gave its XP at once gives no second XP
  const xp = await xpOf(occurrenceId);
  await ownerPage.goto(`/proofs/${await proofIdOf(occurrenceId)}`);
  await button(ownerPage, 'Aprovar').click();
  await expect
    .poll(() => statusOf(occurrenceId))
    .toEqual({ status: 'done', proof_review_status: 'approved' });
  expect(await xpOf(occurrenceId)).toBe(xp);

  // An approved proof can still be contested
  await ownerPage.goto(`/proofs/${await proofIdOf(occurrenceId)}`);
  await button(ownerPage, 'Contestar').click();
  await ownerPage.getByRole('radio', { name: 'Não fiz' }).click();
  await ownerPage.getByLabel('Motivo').fill('A foto é de outro lugar');
  await button(ownerPage, 'Enviar contestação').click();
  await expect
    .poll(() => statusOf(occurrenceId))
    .toEqual({ status: 'missed', proof_review_status: 'disputed' });
  await expect.poll(() => xpOf(occurrenceId)).toBe(0);

  await memberPage.goto(`/tasks/${occurrenceId}`);
  await expect(contains(memberPage, 'Motivo: A foto é de outro lugar').first()).toBeVisible();
  await expect(button(memberPage, 'Tirar a foto para concluir')).toHaveCount(0);
  await expect(button(memberPage, 'Voltar para pendente')).toHaveCount(0);

  // The road by the address refuses too: the server, not the missing button, is the rule
  await memberPage.goto(`/tasks/${occurrenceId}/proof`);
  await expect(
    memberPage.getByText(/Um administrador contestou a foto desta tarefa/),
  ).toBeVisible();
  await expect(memberPage.locator('video')).toHaveCount(0);
});

test('reopening drops the photo: the link goes, and green takes a new one', async ({ browser }) => {
  const { ownerPage, memberPage } = await groupWithMember(browser);
  await allowCamera(memberPage);
  const title = uniqueTitle('Reaberta');
  await photoTask(ownerPage, title);
  const { occurrenceId } = await spotOf(title);

  await sendPhoto(memberPage, occurrenceId);
  await button(memberPage, 'Voltar à tarefa').click();
  await memberPage.goto(`/tasks/${occurrenceId}`);
  await expect(button(memberPage, 'Ver a foto da prova')).toBeVisible();

  const reopened = memberPage.waitForResponse('**/rest/v1/rpc/set_occurrence_status');
  await button(memberPage, 'Voltar para pendente').click();
  await expect(button(memberPage, 'Tirar a foto para concluir')).toBeVisible();
  expect((await reopened).status()).toBe(200);
  expect(await statusOf(occurrenceId)).toMatchObject({ status: 'pending' });
  await memberPage.reload();
  await expect(button(memberPage, 'Tirar a foto para concluir')).toBeVisible();
  await expect(button(memberPage, 'Ver a foto da prova')).toHaveCount(0);

  await sendPhoto(memberPage, occurrenceId);
  const { data } = await admin
    .from('task_proofs')
    .select('superseded_at')
    .eq('occurrence_id', occurrenceId)
    .order('received_at');
  expect(data!.map(({ superseded_at }) => superseded_at !== null)).toEqual([true, false]);

  // Known bug, item 3 of docs/agentes/handoffs/20261101-2240-qa-testes-para-prova-foto-achados-do-qa.md:
  // without the reload, the link stays and leads to the photo that no longer counts. Delete `test.fail`
  // along with the fix.
  await memberPage.goto(`/tasks/${occurrenceId}`);
  await expect(button(memberPage, 'Ver a foto da prova')).toBeVisible();
  await button(memberPage, 'Voltar para pendente').click();
  await expect(button(memberPage, 'Tirar a foto para concluir')).toBeVisible();
  test.fail();
  await expect(button(memberPage, 'Ver a foto da prova')).toHaveCount(0, { timeout: 3_000 });
});

test('a photo the server really refuses goes back to the camera, and offline it waits to be sent', async ({
  page,
  context,
}) => {
  await allowCamera(page);
  await signUpWithContext(page, 'Refugo');
  const title = uniqueTitle('Recusada de verdade');
  await page.goto('/tasks/new');
  await page.getByLabel('O que precisa ser feito?').fill(title);
  await button(page, 'Mais opções').click();
  await page.getByRole('switch', { name: PHOTO }).click();
  await button(page, 'Salvar').click();
  await expect(page.getByRole('heading', { name: 'Hoje', exact: true })).toBeVisible();
  const { occurrenceId } = await spotOf(title);

  // The bytes go as they are; only the hash the client declares is wrong, as corruption would make it
  await page.route('**/functions/v1/proof-validate', async (route) => {
    const request = route.request();
    if (request.method() !== 'POST') return route.continue();
    const headers = await request.allHeaders();
    const meta = JSON.parse(decodeURIComponent(headers['x-proof-meta']!));
    meta.sha256 = '0'.repeat(64);
    const response = await route.fetch({
      headers: { ...headers, 'x-proof-meta': encodeURIComponent(JSON.stringify(meta)) },
    });
    expect(response.status()).toBe(422);
    await route.fulfill({ response });
  });
  await page.goto(`/tasks/${occurrenceId}/proof`);
  await button(page, CONSENT).click();
  await expect(button(page, 'Tirar foto')).toBeEnabled();
  await button(page, 'Tirar foto').click();
  await button(page, 'Enviar foto').click();
  await expect(page.getByText(/A foto chegou diferente do que saiu do aparelho/)).toBeVisible();
  await expect(button(page, 'Tirar foto')).toBeVisible();
  expect(await statusOf(occurrenceId)).toMatchObject({ status: 'pending' });
  await page.unroute('**/functions/v1/proof-validate');

  // Without a connection the taken photo stays, and goes when the connection is back
  await expect(button(page, 'Tirar foto')).toBeEnabled();
  await button(page, 'Tirar foto').click();
  await expect(button(page, 'Enviar foto')).toBeEnabled();
  await context.setOffline(true);
  await expect(button(page, 'Enviar foto')).toBeDisabled();
  await expect(page.getByText(/A foto continua aqui/)).toBeVisible();
  await context.setOffline(false);
  await button(page, 'Enviar foto').click();
  await answered(page.getByText(ACCEPTED)).toBeVisible();
  await page.goto('/');
  await expect(check(page, title, 'Feito')).toBeVisible();
});
