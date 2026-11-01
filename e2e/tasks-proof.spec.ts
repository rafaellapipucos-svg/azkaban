import { randomUUID } from 'node:crypto';
import { expect, test, type Browser, type Page } from '@playwright/test';
import { admin } from '../supabase/functions/_shared/proof-kit';
import { currentProofId, reviewProof, sendProof, spotOf } from './proof-fixtures';

// Needs `pnpm db:start` and `pnpm exec supabase functions serve`. The camera flow does not exist yet
// (prova-foto), so a proof is sent and reviewed through the database functions it will call, in
// `proof-fixtures.ts`. Accounts are unique per run and exist only in the local database.
const newUser = (name: string) => ({
  name,
  email: `${name.toLowerCase()}-${randomUUID()}@example.com`,
  password: randomUUID(),
});
type User = ReturnType<typeof newUser>;

// Titles are looked up in the database, so each test makes its own.
const uniqueTitle = (base: string) => `${base} ${randomUUID().slice(0, 6)}`;

const button = (page: Page, name: string) =>
  page.getByRole('button', { name, exact: true }).locator('visible=true');
const text = (page: Page, value: string) =>
  page.getByText(value, { exact: true }).locator('visible=true');
const contains = (page: Page, value: string | RegExp) =>
  page.getByText(value).locator('visible=true');
const check = (page: Page, title: string, status: string) =>
  page.getByRole('checkbox', { name: `${title}: ${status}` });

const ZONE = 'America/Sao_Paulo';
const todayLocal = () => new Intl.DateTimeFormat('en-CA', { timeZone: ZONE }).format(new Date());
const plusDays = (date: string, days: number) =>
  new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);

async function signUp(page: Page, user: User) {
  await page.goto('/sign-up');
  await page.getByLabel('Seu nome').fill(user.name);
  await page.getByLabel('E-mail', { exact: true }).fill(user.email);
  await page.getByLabel('Senha').fill(user.password);
  await button(page, 'Criar conta').first().click();
}

async function signUpWithContext(page: Page, name: string, context = 'Casa') {
  await signUp(page, newUser(name));
  await button(page, 'Novo contexto').click();
  await page.getByLabel('Nome', { exact: true }).fill(context);
  await button(page, 'Salvar').click();
  await expect(page.getByRole('heading', { name: 'Hoje', exact: true })).toBeVisible();
}

async function newContext(page: Page, name: string, group: string) {
  await page.goto('/contexts/new');
  await page.getByLabel('Nome', { exact: true }).fill(name);
  await page.getByRole('radio', { name: group }).click();
  await button(page, 'Salvar').click();
  await expect(page.getByRole('heading', { name: 'Hoje', exact: true })).toBeVisible();
}

/** A group owner and a member, both signed in, and a group context for the owner's tasks. */
async function groupWithMember(browser: Browser) {
  const owner = newUser('Dona');
  const member = newUser('Duda');
  const ownerPage = await (await browser.newContext()).newPage();
  const memberPage = await (await browser.newContext()).newPage();

  await signUp(ownerPage, owner);
  await expect(ownerPage.getByRole('heading', { name: 'Hoje', exact: true })).toBeVisible();
  await ownerPage.goto('/groups/new');
  await ownerPage.getByLabel('Nome do grupo').fill('Equipe P');
  await button(ownerPage, 'Criar grupo').click();
  await button(ownerPage, 'Convidar membro').click();
  const code = await ownerPage.getByRole('heading', { name: /^[A-Z2-9]{10}$/ }).innerText();
  await newContext(ownerPage, 'Escritório', 'Equipe P');

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

async function createOn(page: Page, title: string, day: string) {
  await page.goto(`/tasks/new?day=${day}&time=09:00`);
  await page.getByLabel('O que precisa ser feito?').fill(title);
  await button(page, 'Salvar').click();
  await expect(page.getByRole('heading', { name: 'Hoje', exact: true })).toBeVisible();
}

const PHOTO = 'Pedir uma foto para concluir';
const APPROVAL = 'Um administrador aprova a foto';

test('a task that asks for a photo cannot be marked done from the list or the detail', async ({
  page,
}) => {
  await signUpWithContext(page, 'Foto');
  const title = uniqueTitle('Foto da pia');

  await page.goto('/tasks/new');
  await page.getByLabel('O que precisa ser feito?').fill(title);
  await button(page, 'Mais opções').click();
  await page.getByRole('switch', { name: PHOTO }).click();
  // Nobody reviews a personal task: the approval switch has no place here
  await expect(page.getByRole('switch', { name: APPROVAL })).toHaveCount(0);
  await button(page, 'Salvar').click();
  await expect(page.getByRole('heading', { name: 'Hoje', exact: true })).toBeVisible();

  // The list says why the check is off, and tapping it changes nothing
  await expect(check(page, title, 'Pendente')).toBeDisabled();
  await expect(contains(page, 'Pede foto para concluir')).toBeVisible();

  // The detail has no "feito", and still offers the yellow and the red, which need no photo
  await text(page, title).click();
  await expect(page.getByRole('heading', { name: title })).toBeVisible();
  await expect(
    contains(page, 'Esta tarefa só fica feita com uma foto tirada na hora.'),
  ).toBeVisible();
  await expect(button(page, 'Marcar como feito')).toHaveCount(0);
  await expect(button(page, 'Tentei, mas não consegui')).toBeVisible();
  await expect(button(page, 'Não fiz')).toBeVisible();
  const task = await spotOf(title);
  const row = await admin
    .from('task_occurrences')
    .select('status')
    .eq('id', task.occurrenceId)
    .single();
  expect(row.data?.status).toBe('pending');
});

test('a screen that still offers "feito" gets the proof_required message when the task now asks for a photo', async ({
  page,
}) => {
  await signUpWithContext(page, 'Velha');
  const title = uniqueTitle('Tela velha');
  await createOn(page, title, todayLocal());
  await text(page, title).click();
  await expect(button(page, 'Marcar como feito')).toBeVisible();

  // Another device turns the photo on while this screen is open
  const task = await spotOf(title);
  const update = await admin
    .from('tasks')
    .update({ requires_photo_proof: true })
    .eq('id', task.taskId);
  expect(update.error).toBeNull();

  await button(page, 'Marcar como feito').click();
  await expect(
    page.getByText(
      'Esta tarefa só fica feita com uma foto tirada na hora. Abra a tarefa para enviá-la.',
    ),
  ).toBeVisible();
  await expect(page.getByText('Pendente → Feito')).toHaveCount(0);
  // The refreshed screen now matches the database
  await expect(button(page, 'Marcar como feito')).toHaveCount(0);
});

test('the other refusals of the database have a message of their own', async ({ page }) => {
  await signUpWithContext(page, 'Recusas');
  const title = uniqueTitle('Recusada');
  await createOn(page, title, todayLocal());

  const refuse = (path: string, message: string) =>
    page.route(`**/rest/v1/rpc/${path}`, (route) =>
      route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({ code: 'P0001', message, details: null, hint: null }),
      }),
    );

  // A disputed occurrence only moves for who can review it
  await refuse('set_occurrence_status', 'proof_disputed');
  await text(page, title).click();
  await button(page, 'Não fiz').click();
  await expect(
    page.getByText(
      'Um administrador contestou a foto desta tarefa. Só quem revisa fotos pode mudar o estado dela agora.',
    ),
  ).toBeVisible();
  await page.unroute('**/rest/v1/rpc/set_occurrence_status');

  // Editing the schedule of a series would drop an overdue occurrence
  await refuse('edit_task', 'overdue_occurrence_blocks_edit');
  await button(page, 'Editar').click();
  await button(page, 'Salvar').click();
  await expect(
    page.getByText(
      'Esta tarefa tem uma repetição atrasada que a mudança apagaria. Marque-a como feita ou como não feita antes, ou edite só esta.',
    ),
  ).toBeVisible();
  await page.unroute('**/rest/v1/rpc/edit_task');

  // Only who owns the task or manages the group moves the photo switches
  await refuse('edit_task', 'proof_flags_locked');
  await button(page, 'Salvar').click();
  await expect(
    page.getByText(
      'Só quem criou a tarefa ou administra o grupo pode ligar ou desligar a foto e a aprovação.',
    ),
  ).toBeVisible();
});

test('a proof in review shows as "em análise" everywhere, then as contested, then approved', async ({
  browser,
}) => {
  const { ownerPage, memberPage } = await groupWithMember(browser);
  const title = uniqueTitle('Relatório com foto');

  // The owner asks for a photo and an approval from Duda; the approval switch needs another person
  await ownerPage.goto('/tasks/new');
  await ownerPage.getByLabel('O que precisa ser feito?').fill(title);
  await button(ownerPage, 'Mais opções').click();
  await ownerPage.getByRole('switch', { name: PHOTO }).click();
  await expect(ownerPage.getByRole('switch', { name: APPROVAL })).toHaveCount(0);
  await ownerPage.getByRole('checkbox', { name: 'Duda' }).click();
  await ownerPage.getByRole('checkbox', { name: 'Eu' }).click();
  await ownerPage.getByRole('switch', { name: APPROVAL }).click();
  await button(ownerPage, 'Salvar').click();
  await expect(ownerPage.getByRole('heading', { name: 'Hoje', exact: true })).toBeVisible();

  const spot = await spotOf(title);
  const flags = await admin
    .from('tasks')
    .select('requires_photo_proof, requires_admin_approval')
    .eq('id', spot.taskId)
    .single();
  expect(flags.data).toEqual({ requires_photo_proof: true, requires_admin_approval: true });
  const ownerId = spot.createdBy;
  const memberId = spot.assigneeId;

  // Duda cannot tick it: the photo is the only road
  await memberPage.goto('/');
  await expect(check(memberPage, title, 'Pendente')).toBeDisabled();
  await expect(contains(memberPage, 'Pede foto para concluir')).toBeVisible();

  // The photo arrives and waits for an admin
  const proofId = await (async () => {
    await sendProof(spot.occurrenceId, memberId);
    return currentProofId(spot.occurrenceId);
  })();

  await memberPage.goto('/');
  await expect(check(memberPage, title, 'Feito, em análise')).toBeVisible();
  await expect(contains(memberPage, /Em análise · Espera um administrador/)).toBeVisible();
  // It counts as done for the goal of the day, and gives no XP yet
  await expect(memberPage.getByRole('progressbar', { name: 'Meta do dia' })).toHaveAttribute(
    'aria-valuetext',
    '1 de 1',
  );
  await expect(memberPage.getByText('0 XP hoje')).toBeVisible();
  await expect(memberPage.getByText(/\+\d+ XP/)).toHaveCount(0);

  // The calendar says it in words, on the day and on its row
  await memberPage.goto('/calendar');
  await expect(
    memberPage.getByRole('button', { name: /1 tarefa: 1 feita, 1 em análise/ }).first(),
  ).toBeVisible();
  await expect(
    memberPage.getByRole('button', { name: new RegExp(`^${title}, .*Feito, em análise$`) }),
  ).toBeVisible();

  // The detail names the state, and the history keeps it
  await memberPage.goto(`/tasks/${spot.occurrenceId}`);
  await expect(memberPage.getByRole('heading', { name: title })).toBeVisible();
  await expect(
    contains(memberPage, 'A foto está em análise. O XP chega quando um administrador aprovar.'),
  ).toBeVisible();
  await expect(contains(memberPage, 'Pendente → Feito (em análise)')).toBeVisible();

  // An admin contests it: yellow, with the reason, and Duda cannot change it
  await reviewProof(ownerId, proofId, { dispute: 'partial', note: 'A foto não mostra a pia' });
  await memberPage.goto(`/tasks/${spot.occurrenceId}`);
  await expect(
    contains(memberPage, 'Um administrador contestou a foto desta tarefa.'),
  ).toBeVisible();
  // The reason shows under the state and again in the history
  await expect(contains(memberPage, 'Motivo: A foto não mostra a pia').first()).toBeVisible();
  await expect(
    contains(memberPage, 'Só quem revisa fotos pode mudar o estado desta tarefa.'),
  ).toBeVisible();
  await expect(button(memberPage, 'Voltar para pendente')).toHaveCount(0);
  await expect(contains(memberPage, 'Feito → Tentei · Foto contestada')).toBeVisible();
  await memberPage.goto('/');
  await expect(check(memberPage, title, 'Tentei')).toBeVisible();
  await expect(contains(memberPage, 'Foto contestada')).toBeVisible();

  // The owner, who is not the author, can still reopen it
  await ownerPage.goto(`/tasks/${spot.occurrenceId}`);
  await expect(button(ownerPage, 'Voltar para pendente')).toBeVisible();

  // Undone by the admin: green again, with its XP, and no longer in review
  await reviewProof(ownerId, proofId, { approve: true });
  await memberPage.goto('/');
  await expect(check(memberPage, title, 'Feito')).toBeVisible();
  await expect(contains(memberPage, /Em análise/)).toHaveCount(0);
  await expect(memberPage.getByText(/\+\d+ XP/).first()).toBeVisible();
  await memberPage.goto(`/tasks/${spot.occurrenceId}`);
  await expect(contains(memberPage, 'Tentei → Feito · Foto aprovada')).toBeVisible();
});

test('the place of a context: kept as a whole, edited, and removed', async ({ page, context }) => {
  await signUpWithContext(page, 'Lugar');
  const name = uniqueTitle('Mercado');
  await context.grantPermissions(['geolocation']);
  await context.setGeolocation({ latitude: -23.55, longitude: -46.63, accuracy: 25 });

  await page.goto('/contexts/new');
  await page.getByLabel('Nome', { exact: true }).fill(name);
  await expect(page.getByRole('radio', { name: /Trabalho/ })).toBeChecked();
  // An address with no point is not a place: the database wants all four columns or none
  await page.getByLabel('Endereço').fill('Rua das Flores, 10');
  await button(page, 'Salvar').click();
  await expect(
    page.getByText('Toque em usar minha localização atual para marcar o ponto.'),
  ).toBeVisible();

  await button(page, 'Usar minha localização atual').click();
  await expect(page.getByText('Ponto marcado: -23.55, -46.63')).toBeVisible();
  await expect(page.getByText('200 m', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: /^Aumentar/ }).click();
  await expect(page.getByText('250 m', { exact: true })).toBeVisible();
  await button(page, 'Salvar').click();
  await expect(page.getByRole('heading', { name: 'Hoje', exact: true })).toBeVisible();

  const saved = await admin
    .from('contexts')
    .select('id, location_address, location_lat, location_lng, location_radius_m')
    .eq('name', name)
    .single();
  expect(saved.data).toMatchObject({
    location_address: 'Rua das Flores, 10',
    location_lat: -23.55,
    location_lng: -46.63,
    location_radius_m: 250,
  });

  // Editing shows what was saved, and removing it clears all four columns
  await page.goto(`/contexts/${saved.data!.id}`);
  await expect(page.getByLabel('Endereço')).toHaveValue('Rua das Flores, 10');
  await expect(page.getByText('250 m', { exact: true })).toBeVisible();
  await button(page, 'Remover o local').click();
  await button(page, 'Salvar').click();
  await expect(page.getByRole('heading', { name: 'Hoje', exact: true })).toBeVisible();
  const removed = await admin
    .from('contexts')
    .select('location_address, location_lat, location_lng, location_radius_m')
    .eq('id', saved.data!.id)
    .single();
  expect(removed.data).toEqual({
    location_address: null,
    location_lat: null,
    location_lng: null,
    location_radius_m: null,
  });
});

test('moving an overdue task warns it stays overdue, and it keeps its original deadline', async ({
  page,
}) => {
  await signUpWithContext(page, 'Remarca');
  const today = todayLocal();
  const late = uniqueTitle('Ontem sem fazer');
  const onTime = uniqueTitle('Amanhã tranquila');
  await createOn(page, late, plusDays(today, -1));
  await createOn(page, onTime, plusDays(today, 1));

  const notice =
    'Esta tarefa já passou do prazo. Mudar o horário não tira o atraso: ela continua atrasada, com menos XP, e o prazo para concluir segue o de antes.';

  // A task that is not overdue gets no warning
  await page.goto(`/tasks/${(await spotOf(onTime)).occurrenceId}`);
  await button(page, 'Reagendar').click();
  await expect(page.getByText(notice)).toHaveCount(0);

  // The overdue one does, before it is moved
  const before = await spotOf(late);
  await page.goto(`/tasks/${before.occurrenceId}`);
  await button(page, 'Reagendar').click();
  await expect(page.getByText(notice)).toBeVisible();
  const original = await admin
    .from('task_occurrences')
    .select('overdue_at')
    .eq('id', before.occurrenceId)
    .single();

  await page.getByLabel('Dia', { exact: true }).fill(plusDays(today, 1));
  await button(page, 'Salvar novo horário').click();
  // The panel closes when the change is saved
  await expect(button(page, 'Salvar novo horário')).toHaveCount(0);

  // Moved to tomorrow, but the delay stays: the deadline is the one it always had
  const moved = await admin
    .from('task_occurrences')
    .select('overdue_at, scheduled_start')
    .eq('id', before.occurrenceId)
    .single();
  expect(moved.data?.overdue_at).toBe(original.data?.overdue_at);
  expect(moved.data?.scheduled_start?.slice(0, 10)).toBe(plusDays(today, 1));

  // Hoje lists it once, among the overdue ones, and not again as tomorrow's
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Atrasadas' })).toBeVisible();
  await expect(text(page, late)).toHaveCount(1);
});
