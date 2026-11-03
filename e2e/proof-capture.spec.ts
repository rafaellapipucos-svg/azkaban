import { createHash } from 'node:crypto';
import { expect, test, type Page, type Route } from '@playwright/test';
import { proofRules } from '../packages/config/src/proof';
import { admin } from '../supabase/functions/_shared/proof-kit';
import {
  APPROVAL,
  PHOTO,
  button,
  check,
  contains,
  groupWithMember,
  newUser,
  signUp,
  signUpWithContext,
  spotOf,
  text,
  uniqueTitle,
} from './proof-fixtures';

// The real road: Chromium's fake camera, `proof-validate` and `proof-url` in the local stack. Needs
// `pnpm db:start`, which serves the functions too. Where a failure cannot be caused for real,
// only the answer of the server is replaced, and the rest of the flow still runs.
// The headless shell Playwright uses by default answers `getUserMedia` with NotSupportedError, so this
// file runs on the installed Chrome. Without the software GL of `--use-angle`, the fake track ends at
// once at 2x2, with no error.
test.use({
  channel: 'chrome',
  launchOptions: { args: ['--use-fake-device-for-media-stream', '--use-angle=swiftshader'] },
});

const CONSENT = 'Antes de enviar a foto';
const PREVIEW = 'A foto que será enviada';
const ACCEPTED = 'O servidor aceitou a foto, e a tarefa está feita.';
const IN_REVIEW =
  'O servidor aceitou a foto. Agora um administrador confere, e o XP chega quando ele aprovar.';

// React Native Web draws an image twice: the box and a transparent <img> with the same name.
const preview = (page: Page) => page.getByRole('img', { name: PREVIEW }).first();
// A request can wait 16 s for a worker of the local runtime that is retiring, longer than the 15 s of
// the config. What is under test is the answer, not how long it took.
const answered = expect.configure({ timeout: 30_000 });
const allowCamera = (page: Page) => page.context().grantPermissions(['camera']);

async function photoTask(
  page: Page,
  title: string,
  { assignee, approval }: { assignee?: string; approval?: boolean } = {},
) {
  await page.goto('/tasks/new');
  await page.getByLabel('O que precisa ser feito?').fill(title);
  await button(page, 'Mais opções').click();
  await page.getByRole('switch', { name: PHOTO }).click();
  if (assignee) {
    await page.getByRole('checkbox', { name: assignee }).click();
    await page.getByRole('checkbox', { name: 'Eu' }).click();
  }
  if (approval) await page.getByRole('switch', { name: APPROVAL }).click();
  await button(page, 'Salvar').click();
  await expect(page.getByRole('heading', { name: 'Hoje', exact: true })).toBeVisible();
}

/** Every point of ADR-0007, section 14, with the numbers of the config. */
async function expectNotice(page: Page) {
  for (const sentence of [
    'Suas coordenadas não são guardadas.',
    'Quem vê: você e os administradores do grupo, nunca os colegas. Em tarefa privada, só você.',
    'A foto leva carimbados o seu nome, o título da tarefa e o horário.',
    'Evite mostrar outras pessoas na foto. Se alguém aparecer, quem revisa também vê.',
    `A foto é apagada depois de ${proofRules.retentionDays} dias. O registro sem a imagem, com horários e marcas de local, é apagado depois de ${proofRules.recordRetentionDays} dias.`,
    {
      2: 'Para pedir a exclusão antes do prazo, fale com o dono do grupo.',
      3: `Você pode revogar este aceite em Perfil > Privacidade. Revogar não apaga as fotos já enviadas: elas são apagadas depois de ${proofRules.retentionDays} dias, ou antes, se você excluir a sua conta, também por lá.`,
    }[proofRules.consentVersion],
  ]) {
    await expect(page.getByText(sentence, { exact: true })).toBeVisible();
  }
}

async function acceptNotice(page: Page) {
  await expect(page.getByRole('heading', { name: CONSENT })).toBeVisible();
  await button(page, 'Aceitar e continuar').click();
}

async function takePhoto(page: Page) {
  await expect(button(page, 'Tirar foto')).toBeEnabled();
  await button(page, 'Tirar foto').click();
  await expect(preview(page)).toBeVisible();
}

/** Through the detail page, as Duda does, up to the screen that confirms it. */
async function sendPhoto(page: Page, occurrenceId: string, confirmation: string) {
  await page.goto(`/tasks/${occurrenceId}`);
  await button(page, 'Tirar a foto para concluir').click();
  await takePhoto(page);
  await button(page, 'Enviar foto').click();
  await answered(page.getByText(confirmation)).toBeVisible();
}

const proofRows = async (occurrenceId: string) => {
  const { data, error } = await admin
    .from('task_proofs')
    .select('id, sha256, size_bytes, width_px, height_px, flags, platform, storage_path')
    .eq('occurrence_id', occurrenceId);
  expect(error).toBeNull();
  return data!;
};

const statusOf = async (occurrenceId: string) => {
  const { data } = await admin
    .from('task_occurrences')
    .select('status, proof_review_status')
    .eq('id', occurrenceId)
    .single();
  return data;
};

const onValidate = (page: Page, handler: (route: Route) => Promise<void>) =>
  page.route('**/functions/v1/proof-validate', (route) =>
    route.request().method() === 'POST' ? handler(route) : route.continue(),
  );

test('a photo goes from the check to green through proof-validate, and the notice shows once', async ({
  page,
}) => {
  await allowCamera(page);
  await signUpWithContext(page, 'Clara');
  const title = uniqueTitle('Pia limpa');
  await photoTask(page, title);
  const { occurrenceId, assigneeId } = await spotOf(title);

  // Refusing the notice sends nothing and leaves the yellow and the red open
  await check(page, title, 'Pendente').click();
  await expect(page.getByRole('heading', { name: CONSENT })).toBeVisible();
  await expectNotice(page);
  await expect(page.locator('video')).toHaveCount(0);
  await button(page, 'Agora não').click();
  await expect(check(page, title, 'Pendente')).toBeVisible();

  await check(page, title, 'Pendente').click();
  await acceptNotice(page);
  const answer = page.waitForResponse('**/functions/v1/proof-validate');
  await expect(page.locator('video')).toBeVisible();
  await expect(page.locator('input[type="file"]')).toHaveCount(0);
  await takePhoto(page);
  expect(await statusOf(occurrenceId)).toMatchObject({ status: 'pending' });
  await button(page, 'Enviar foto').click();
  expect((await answer).status()).toBe(200);
  await answered(page.getByText(ACCEPTED)).toBeVisible();

  // The list follows without a reload
  await button(page, 'Voltar à tarefa').click();
  await expect(check(page, title, 'Feito')).toBeVisible();

  // What is stored is what the camera produced: the server's hash is of the object in the bucket
  const [row] = await proofRows(occurrenceId);
  expect(await statusOf(occurrenceId)).toEqual({
    status: 'done',
    proof_review_status: 'unreviewed',
  });
  expect(row).toMatchObject({ platform: 'web', flags: [] });
  expect(Math.max(row!.width_px, row!.height_px)).toBeLessThanOrEqual(1600);
  const stored = await admin.storage.from('task-proofs').download(row!.storage_path!);
  const bytes = Buffer.from(await stored.data!.arrayBuffer());
  expect(bytes.length).toBe(row!.size_bytes);
  expect(createHash('sha256').update(bytes).digest('hex')).toBe(row!.sha256);
  expect([...bytes.subarray(0, 3)]).toEqual([0xff, 0xd8, 0xff]);

  // Accepted once, the notice stays away from the next photo
  const second = uniqueTitle('Fogão limpo');
  await photoTask(page, second);
  await check(page, second, 'Pendente').click();
  await expect(button(page, 'Tirar foto')).toBeVisible();
  await expect(page.getByRole('heading', { name: CONSENT })).toHaveCount(0);

  // Whoever accepted an older version reads the new one before the next photo
  const raised = await admin
    .from('profiles')
    .update({ proof_consent_version: proofRules.consentVersion - 1 })
    .eq('id', assigneeId);
  expect(raised.error).toBeNull();
  await page.goto('/');
  await check(page, second, 'Pendente').click();
  await expect(page.getByRole('heading', { name: CONSENT })).toBeVisible();
  await expectNotice(page);
  await button(page, 'Aceitar e continuar').click();
  await expect(button(page, 'Tirar foto')).toBeVisible();
  const accepted = await admin
    .from('profiles')
    .select('proof_consent_version')
    .eq('id', assigneeId)
    .single();
  expect(accepted.data?.proof_consent_version).toBe(proofRules.consentVersion);
});

test('refusing the camera shows the way to the yellow and the red', async ({ page }) => {
  await signUpWithContext(page, 'Recusa');
  const title = uniqueTitle('Sem câmera');
  await photoTask(page, title);
  await check(page, title, 'Pendente').click();
  await acceptNotice(page);
  await expect(page.getByText(/O acesso à câmera foi recusado/)).toBeVisible();
  await expect(contains(page, /você ainda pode marcar Tentei ou Não fiz/)).toBeVisible();
  await page.goto(`/tasks/${(await spotOf(title)).occurrenceId}`);
  await expect(button(page, 'Não fiz')).toBeVisible();
});

test('the whole preview and the shutter fit the screen of a phone and of a laptop', async ({
  page,
}) => {
  await allowCamera(page);
  await signUpWithContext(page, 'Dobra');
  const title = uniqueTitle('Mesa arrumada');
  await photoTask(page, title);
  await check(page, title, 'Pendente').click();
  await acceptNotice(page);
  for (const size of [
    { width: 375, height: 812 },
    { width: 1280, height: 800 },
  ]) {
    await page.setViewportSize(size);
    await expect(button(page, 'Tirar foto')).toBeEnabled();
    await expect(page.locator('video')).toBeInViewport({ ratio: 1 });
    await expect(button(page, 'Tirar foto')).toBeInViewport({ ratio: 1 });
  }
});

test('a photo left too long is thrown away, and the next one takes a new challenge', async ({
  page,
}) => {
  await allowCamera(page);
  await signUpWithContext(page, 'Demora');
  const title = uniqueTitle('Demorada');
  await photoTask(page, title);
  const { occurrenceId } = await spotOf(title);

  let challenges = 0;
  await page.route('**/rest/v1/rpc/issue_proof_challenge', async (route) => {
    challenges += 1;
    const response = await route.fetch();
    const body = await response.json();
    // The clock of the screen is what is under test, so only the first challenge is short.
    await route.fulfill({
      response,
      json: challenges === 1 ? { ...body, expiresInSeconds: 8 } : body,
    });
  });

  await page.goto(`/tasks/${occurrenceId}/proof`);
  await acceptNotice(page);
  await takePhoto(page);
  await expect(page.getByText('O tempo acabou')).toBeVisible({ timeout: 20_000 });
  await expect(preview(page)).toHaveCount(0);
  await expect(button(page, 'Enviar foto')).toHaveCount(0);
  expect(await proofRows(occurrenceId)).toHaveLength(0);

  await button(page, 'Tirar outra foto').click();
  await takePhoto(page);
  await button(page, 'Enviar foto').click();
  await answered(page.getByText(ACCEPTED)).toBeVisible();
  expect(challenges).toBe(2);
});

test('an answer lost after the commit is a success, not an error and not a second proof', async ({
  page,
}) => {
  await allowCamera(page);
  await signUpWithContext(page, 'Perdida');
  const title = uniqueTitle('Resposta perdida');
  await photoTask(page, title);
  const { occurrenceId } = await spotOf(title);

  let reached = 0;
  await onValidate(page, async (route) => {
    const response = await route.fetch(); // the server commits
    expect(response.status()).toBe(200);
    reached += 1;
    await route.abort('connectionreset'); // and the answer never arrives
  });
  await page.goto(`/tasks/${occurrenceId}/proof`);
  await acceptNotice(page);
  await takePhoto(page);
  await button(page, 'Enviar foto').click();
  await answered(page.getByText(ACCEPTED)).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);
  expect(reached).toBe(1);
  expect(await proofRows(occurrenceId)).toHaveLength(1);
});

test('a request that never arrived keeps the photo, and it goes again with a new challenge', async ({
  page,
}) => {
  await allowCamera(page);
  await signUpWithContext(page, 'Rede');
  const title = uniqueTitle('Sem rede');
  await photoTask(page, title);
  const { occurrenceId } = await spotOf(title);

  let challenges = 0;
  page.on('request', (request) => {
    if (request.url().endsWith('/rpc/issue_proof_challenge')) challenges += 1;
  });
  await onValidate(page, (route) => route.abort('connectionfailed'));
  await page.goto(`/tasks/${occurrenceId}/proof`);
  await acceptNotice(page);
  await takePhoto(page);
  await button(page, 'Enviar foto').click();
  await expect(page.getByText(/Sem resposta do servidor/)).toBeVisible();
  await expect(preview(page)).toBeVisible();
  expect(await statusOf(occurrenceId)).toMatchObject({ status: 'pending' });

  await page.unroute('**/functions/v1/proof-validate');
  await button(page, 'Enviar foto').click();
  await answered(page.getByText(ACCEPTED)).toBeVisible();
  expect(challenges).toBe(2);
  expect(await proofRows(occurrenceId)).toHaveLength(1);
});

test('the failures of the server and of the photo each say what happened', async ({ page }) => {
  await allowCamera(page);
  await signUpWithContext(page, 'Falhas');
  const title = uniqueTitle('Com falhas');
  await photoTask(page, title);
  const { occurrenceId } = await spotOf(title);
  const refuse = (status: number, body: object) =>
    onValidate(page, (route) => route.fulfill({ status, json: body }));
  const attempt = async () => {
    await page.goto(`/tasks/${occurrenceId}/proof`);
    await takePhoto(page);
    await button(page, 'Enviar foto').click();
  };

  await page.goto(`/tasks/${occurrenceId}/proof`);
  await acceptNotice(page);
  await expect(button(page, 'Tirar foto')).toBeVisible();

  // The photo cannot count: back to the camera, with the reason
  await refuse(422, { error: 'proof_hash_mismatch' });
  await attempt();
  await expect(page.getByText(/A foto chegou diferente do que saiu do aparelho/)).toBeVisible();
  await expect(button(page, 'Tirar foto')).toBeVisible();
  await page.unroute('**/functions/v1/proof-validate');

  // The road failed: the photo stays
  await refuse(408, { error: 'upload_timeout' });
  await attempt();
  await expect(page.getByText(/A conexão ficou lenta/)).toBeVisible();
  await expect(button(page, 'Enviar foto')).toBeVisible();
  await page.unroute('**/functions/v1/proof-validate');

  // That attempt spent the challenge, so giving up on the photo takes a new one
  await button(page, 'Tirar outra').click();
  await takePhoto(page);

  // The gateway's own body has no code of ours: its status says it. Nothing to retry.
  await refuse(401, { code: 401, message: 'Invalid JWT' });
  await attempt();
  await expect(page.getByText(/Sua sessão terminou/)).toBeVisible();
  await expect(button(page, 'Enviar foto')).toHaveCount(0);
  await expect(button(page, 'Voltar à tarefa')).toBeVisible();
  await page.unroute('**/functions/v1/proof-validate');

  // The server is the one that demands the notice, even when the screen thought it was accepted
  await page.route(
    '**/rest/v1/rpc/issue_proof_challenge',
    (route) =>
      route.fulfill({
        status: 400,
        json: { code: 'P0001', message: 'proof_consent_required', details: null, hint: null },
      }),
    { times: 1 },
  );
  await page.goto(`/tasks/${occurrenceId}/proof`);
  await acceptNotice(page);
  await expect(button(page, 'Tirar foto')).toBeVisible();

  // Too many challenges: back to the task, with no camera
  await page.route('**/rest/v1/rpc/issue_proof_challenge', (route) =>
    route.fulfill({
      status: 400,
      json: { code: 'P0001', message: 'challenge_rate_limited', details: null, hint: null },
    }),
  );
  await page.goto(`/tasks/${occurrenceId}/proof`);
  await expect(page.getByText(/Foram muitas tentativas em pouco tempo/)).toBeVisible();
  await expect(page.locator('video')).toHaveCount(0);
  await expect(button(page, 'Tentar de novo')).toHaveCount(0);
  await page.unroute('**/rest/v1/rpc/issue_proof_challenge');

  // An encoder that fails is a message on the camera, not a broken screen
  await page.addInitScript(() => {
    HTMLCanvasElement.prototype.toBlob = (callback) => callback(null);
  });
  await page.goto(`/tasks/${occurrenceId}/proof`);
  await expect(button(page, 'Tirar foto')).toBeEnabled();
  await button(page, 'Tirar foto').click();
  await expect(page.getByText('Não conseguimos preparar a foto. Tire outra.')).toBeVisible();

  expect(await statusOf(occurrenceId)).toMatchObject({ status: 'pending' });
});

test('offline, the camera stays closed and says why', async ({ page, context }) => {
  await allowCamera(page);
  await signUpWithContext(page, 'Offline');
  const title = uniqueTitle('Sem internet');
  await photoTask(page, title);
  await text(page, title).click();
  const entry = button(page, 'Tirar a foto para concluir');
  await expect(entry).toBeEnabled();

  await context.setOffline(true);
  await expect(entry).toBeDisabled();
  await expect(page.getByText(/Sem conexão, não dá para enviar a foto/)).toBeVisible();

  // The road by the list ends in the same explanation, with no camera
  await page.goBack();
  await check(page, title, 'Pendente').click();
  await expect(page).toHaveURL(/\/tasks\/[^/]+\/proof$/);
  await expect(page.getByText(/Sem conexão, não dá para enviar a foto/)).toBeVisible();
  await expect(page.locator('video')).toHaveCount(0);

  await context.setOffline(false);
  await acceptNotice(page);
  await expect(page.locator('video')).toBeVisible();
});

test('the location is asked only where the context has one, and refusing it does not stop the proof', async ({
  browser,
}) => {
  const { ownerPage, memberPage } = await groupWithMember(browser);
  await allowCamera(memberPage);
  const refused = uniqueTitle('Loja sem GPS');
  const far = uniqueTitle('Loja longe');
  const plain = uniqueTitle('Sem local');

  // Headless Chrome answers "denied" with no prompt, which would hide the explanation: until the test
  // grants the location, the page reads "prompt", as a person's browser does.
  await memberPage.addInitScript(`
    if (!sessionStorage.getItem('granted')) {
      navigator.permissions.query = async () => ({ state: 'prompt' });
    }
  `);

  // Before the context has a place, nobody asks
  await photoTask(ownerPage, plain, { assignee: 'Duda' });
  const free = await spotOf(plain);
  await memberPage.goto(`/tasks/${free.occurrenceId}/proof`);
  await acceptNotice(memberPage);
  await expect(button(memberPage, 'Tirar foto')).toBeVisible();
  await expect(memberPage.getByRole('heading', { name: 'Sua localização' })).toHaveCount(0);

  await photoTask(ownerPage, refused, { assignee: 'Duda' });
  await photoTask(ownerPage, far, { assignee: 'Duda' });
  const a = await spotOf(refused);
  const b = await spotOf(far);
  const task = await admin.from('tasks').select('context_id').eq('id', a.taskId).single();
  const place = await admin
    .from('contexts')
    .update({
      location_address: 'Rua das Flores, 10',
      location_lat: -23.55,
      location_lng: -46.63,
      location_radius_m: 200,
    })
    .eq('id', task.data!.context_id);
  expect(place.error).toBeNull();

  // The browser refuses the location: the photo counts, and carries the mark
  await memberPage.goto(`/tasks/${a.occurrenceId}/proof`);
  await expect(memberPage.getByRole('heading', { name: 'Sua localização' })).toBeVisible();
  await button(memberPage, 'Usar minha localização').click();
  await takePhoto(memberPage);
  await button(memberPage, 'Enviar foto').click();
  await answered(memberPage.getByText(ACCEPTED)).toBeVisible();
  await expect(memberPage.getByText('Sem localização')).toBeVisible();
  expect(await proofRows(a.occurrenceId)).toMatchObject([{ flags: ['location_missing'] }]);

  // Allowed, and 5 km away: no notice to read, and the distance is what stays
  await memberPage.context().grantPermissions(['camera', 'geolocation']);
  await memberPage.context().setGeolocation({ latitude: -23.6, longitude: -46.63, accuracy: 25 });
  await memberPage.evaluate("sessionStorage.setItem('granted', '1')");
  await memberPage.goto(`/tasks/${b.occurrenceId}/proof`);
  await takePhoto(memberPage);
  await button(memberPage, 'Enviar foto').click();
  await answered(memberPage.getByText(ACCEPTED)).toBeVisible();
  await expect(memberPage.getByText('Fora do raio do local')).toBeVisible();
  const stored = await admin
    .from('task_proofs')
    .select('flags, distance_m, accuracy_m, id')
    .eq('occurrence_id', b.occurrenceId)
    .single();
  expect(stored.data).toMatchObject({ flags: ['out_of_radius'], accuracy_m: 25 });
  expect(stored.data!.distance_m).toBeGreaterThan(5000);

  // The reviewer reads the marks, in words
  await ownerPage.goto(`/proofs/${(await proofRows(a.occurrenceId))[0]!.id}`);
  await expect(ownerPage.getByText('Sem localização')).toBeVisible();
  await ownerPage.goto(`/proofs/${stored.data!.id}`);
  await expect(ownerPage.getByText('Fora do raio do local')).toBeVisible();
  await expect(ownerPage.getByText(/A \d+ m do local, com precisão de 25 m/)).toBeVisible();
});

test('an approval waits in review, and the admin approves, contests and undoes it on screen', async ({
  browser,
}) => {
  const { ownerPage, memberPage } = await groupWithMember(browser);
  await allowCamera(memberPage);
  const withApproval = uniqueTitle('Relatório pedindo aprovação');
  const plain = uniqueTitle('Relatório direto');
  await photoTask(ownerPage, withApproval, { assignee: 'Duda', approval: true });
  await photoTask(ownerPage, plain, { assignee: 'Duda' });
  const a = await spotOf(withApproval);
  const b = await spotOf(plain);

  await memberPage.goto(`/tasks/${a.occurrenceId}/proof`);
  await acceptNotice(memberPage);
  await takePhoto(memberPage);
  await button(memberPage, 'Enviar foto').click();
  await answered(memberPage.getByText(IN_REVIEW)).toBeVisible();
  await expect(memberPage.getByText('Em análise', { exact: true })).toBeVisible();
  await button(memberPage, 'Voltar à tarefa').click();
  await memberPage.goto('/');
  await expect(check(memberPage, withApproval, 'Feito, em análise')).toBeVisible();
  await expect(memberPage.getByText('0 XP hoje')).toBeVisible();

  // The author sees the photo, and has nothing to decide
  await memberPage.goto(`/tasks/${a.occurrenceId}`);
  await button(memberPage, 'Ver a foto da prova').click();
  await expect(memberPage.getByText('Esperando aprovação')).toBeVisible();
  await expect(button(memberPage, 'Aprovar')).toHaveCount(0);

  // The admin finds it from the group's page, and the photo opens from a host the browser reaches
  await ownerPage.goto('/groups');
  await ownerPage.getByText('Equipe P').click();
  await button(ownerPage, 'Revisar fotos').click();
  let photos = 0;
  let urlRequests = 0;
  ownerPage.on('request', (request) => {
    if (request.method() === 'POST' && request.url().endsWith('/functions/v1/proof-url')) {
      urlRequests += 1;
    }
  });
  ownerPage.on('response', (response) => {
    if (response.url().includes('/storage/v1/object/sign/task-proofs/')) {
      photos += 1;
      expect(response.status()).toBe(200);
      expect(response.headers()['content-type']).toBe('image/jpeg');
    }
  });
  await ownerPage.getByText(withApproval).click();
  await expect(
    ownerPage.getByRole('img', { name: new RegExp(withApproval) }).first(),
  ).toBeVisible();
  await expect(ownerPage.getByText(/Recebida em/)).toBeVisible();
  await expect(ownerPage.getByText('Enviada por Duda')).toBeVisible();
  await expect(ownerPage.getByText(/^Enviada pelo navegador, versão \S+$/)).toBeVisible();
  await expect(ownerPage.getByText(/na web não dá para garantir/)).toBeVisible();
  await expect(ownerPage.getByText(/O carimbo na foto é só um desenho/)).toBeVisible();
  await expect.poll(() => photos).toBe(1);
  expect(urlRequests).toBe(1);

  // Opening it again asks for a URL again: the one before it lasts only a minute
  await ownerPage.goBack();
  await ownerPage.getByText(withApproval).click();
  await expect.poll(() => urlRequests).toBe(2);

  await button(ownerPage, 'Aprovar').click();
  await expect(ownerPage.getByText(withApproval)).toHaveCount(0);
  expect(await statusOf(a.occurrenceId)).toEqual({
    status: 'done',
    proof_review_status: 'approved',
  });
  await memberPage.goto('/');
  await expect(check(memberPage, withApproval, 'Feito')).toBeVisible();
  await expect(memberPage.getByText(/\+\d+ XP/).first()).toBeVisible();

  // A proof nobody had to approve can still be contested, from the task
  await sendPhoto(memberPage, b.occurrenceId, ACCEPTED);
  await ownerPage.goto(`/tasks/${b.occurrenceId}`);
  await button(ownerPage, 'Ver a foto da prova').click();
  await button(ownerPage, 'Contestar').click();
  await button(ownerPage, 'Enviar contestação').click();
  await expect(ownerPage.getByText(/Escreva o motivo/)).toBeVisible();
  await ownerPage.getByLabel('Motivo').fill('A foto não mostra o relatório');
  await button(ownerPage, 'Enviar contestação').click();
  await expect(ownerPage.getByRole('heading', { name: plain })).toBeVisible();
  await expect
    .poll(() => statusOf(b.occurrenceId))
    .toEqual({ status: 'partial', proof_review_status: 'disputed' });

  await memberPage.goto(`/tasks/${b.occurrenceId}`);
  await expect(contains(memberPage, 'Motivo: A foto não mostra o relatório').first()).toBeVisible();

  // Undoing is approving: green again
  await ownerPage.goto(`/tasks/${b.occurrenceId}`);
  await button(ownerPage, 'Ver a foto da prova').click();
  await expect(ownerPage.getByText('Contestada', { exact: true })).toBeVisible();
  await button(ownerPage, 'Desfazer contestação').click();
  await expect
    .poll(() => statusOf(b.occurrenceId))
    .toEqual({ status: 'done', proof_review_status: 'approved' });
});

test('an admin who is the author reviews nothing, and a deleted photo leaves the record', async ({
  page,
}) => {
  await allowCamera(page);
  const owner = newUser('Dona');
  await signUp(page, owner);
  await expect(page.getByRole('heading', { name: 'Hoje', exact: true })).toBeVisible();
  await page.goto('/groups/new');
  await page.getByLabel('Nome do grupo').fill('Equipe A');
  await button(page, 'Criar grupo').click();
  await expect(button(page, 'Convidar membro')).toBeVisible();
  await page.goto('/contexts/new');
  await page.getByLabel('Nome', { exact: true }).fill('Sala');
  await page.getByRole('radio', { name: 'Equipe A' }).click();
  await button(page, 'Salvar').click();
  await expect(page.getByRole('heading', { name: 'Hoje', exact: true })).toBeVisible();

  const title = uniqueTitle('Minha foto');
  await photoTask(page, title);
  const { occurrenceId } = await spotOf(title);
  await page.goto(`/tasks/${occurrenceId}/proof`);
  await acceptNotice(page);
  await takePhoto(page);
  await button(page, 'Enviar foto').click();
  await answered(page.getByText(ACCEPTED)).toBeVisible();

  const [row] = await proofRows(occurrenceId);
  await page.goto(`/proofs/${row!.id}`);
  await expect(page.getByRole('img', { name: new RegExp(title) }).first()).toBeVisible();
  await expect(button(page, 'Aprovar')).toHaveCount(0);
  await expect(button(page, 'Contestar')).toHaveCount(0);

  const retention = await admin
    .from('task_proofs')
    .update({ photo_deleted_at: new Date().toISOString() })
    .eq('id', row!.id);
  expect(retention.error).toBeNull();
  let asked = 0;
  page.on('request', (request) => {
    if (request.url().includes('/functions/v1/proof-url')) asked += 1;
  });
  await page.reload();
  await expect(page.getByText(/A foto já foi apagada pelo prazo de guarda/)).toBeVisible();
  await expect(page.getByText(/Recebida em/)).toBeVisible();
  expect(asked).toBe(0);
});
