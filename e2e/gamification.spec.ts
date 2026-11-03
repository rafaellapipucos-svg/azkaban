import { expect, test, type Page } from '@playwright/test';
import { sql } from '../supabase/functions/_shared/proof-kit';
import { button, check, newContext, newUser, signUp, text, type User } from './proof-fixtures';

// Needs `pnpm db:start`. XP, the streak and achievements are written by the database on the status
// change (ADR-0010); the screens only read them, and the CelebrationHost hears them by Realtime.

const goal = (page: Page) => page.getByRole('progressbar', { name: 'Meta do dia' });
const celebration = (page: Page) => page.getByRole('alert').locator('visible=true');
// The confetti is the card's only decorative child; with reduced motion it is not drawn at all.
const confetti = (page: Page) => celebration(page).locator(':scope > [aria-hidden="true"]');

async function signUpWithContext(page: Page, user: User, context = 'Casa') {
  await signUp(page, user);
  await button(page, 'Novo contexto').click();
  await page.getByLabel('Nome', { exact: true }).fill(context);
  await button(page, 'Salvar').click();
  await expect(page.getByRole('heading', { name: 'Hoje', exact: true })).toBeVisible();
}

async function quickCreate(page: Page, title: string) {
  await button(page, 'Nova tarefa').click();
  await page.getByLabel('O que precisa ser feito?').fill(title);
  await button(page, 'Criar').click();
  await expect(page.getByText('Pronto! A tarefa foi criada.')).toBeVisible();
}

/** Green, and past the save: the database has written the XP by then, or decided not to. */
async function finish(page: Page, title: string) {
  const saved = page.waitForResponse('**/rest/v1/rpc/set_occurrence_status');
  await check(page, title, 'Pendente').click();
  expect((await saved).status()).toBe(200);
  await expect(check(page, title, 'Feito')).toBeVisible();
}

/** Creates a group of `type` and returns its page, where the ranking is. */
async function newGroup(page: Page, name: string, type?: string) {
  await page.goto('/groups/new');
  await page.getByLabel('Nome do grupo').fill(name);
  if (type) await page.getByRole('radio', { name: type }).click();
  await button(page, 'Criar grupo').click();
  await expect(button(page, 'Convidar membro')).toBeVisible();
  return page.url();
}

const userId = (user: User) => sql(`select id from auth.users where email = '${user.email}'`)[0]!;

test('finishing tasks: XP, the celebration with confetti, the goal ring, the streak and the first achievement', async ({
  page,
}) => {
  await signUpWithContext(page, newUser('Gami'));
  await quickCreate(page, 'Regar as plantas');
  await quickCreate(page, 'Arrumar a cama');
  await expect(goal(page)).toHaveAttribute('aria-valuetext', '0 de 2');
  // pt's plural rule makes 0 singular ("0 dia"); either form passes until a `_zero` key settles it.
  await expect(page.getByRole('button', { name: /^0 dias? de ofensiva$/ })).toBeVisible();

  // The first one: XP, and the achievement on top of the plain celebration, in one card
  await finish(page, 'Regar as plantas');
  await expect(page.getByText('+10 XP')).toBeVisible();
  await expect(goal(page)).toHaveAttribute('aria-valuetext', '1 de 2');
  await expect(celebration(page).getByText('Conquista: Primeira tarefa')).toBeVisible();
  await expect(celebration(page).getByText('Tarefa concluída!')).toBeVisible();
  await expect(confetti(page)).toHaveCount(1);
  // The card closes by itself.
  await expect(celebration(page)).toHaveCount(0);

  // The second meets the goal and makes the day perfect: the full-screen celebration and the streak
  await finish(page, 'Arrumar a cama');
  await expect(goal(page)).toHaveAttribute('aria-valuetext', '2 de 2');
  await expect(page.getByText('Meta cumprida. Bom trabalho!')).toBeVisible();
  await expect(text(page, 'Dia perfeito!')).toBeVisible();
  await button(page, 'Continuar').click();
  await expect(page.getByRole('button', { name: '1 dia de ofensiva' })).toBeVisible();

  // The chip opens the profile: level, total, the streak and the achievement granted
  await page.getByRole('button', { name: '1 dia de ofensiva' }).click();
  // 10 + 10 for the tasks, 20 for the perfect day
  await expect(text(page, '40 XP no total')).toBeVisible();
  await expect(page.getByRole('progressbar', { name: 'Nível 1' })).toHaveAttribute(
    'aria-valuetext',
    '40 de 100 XP',
  );
  await expect(page.getByRole('img', { name: '1 dia de ofensiva' })).toBeVisible();
  const first = page.getByRole('listitem').filter({ hasText: 'Primeira tarefa' });
  await expect(first.getByText(/^Concedida em /)).toBeVisible();
  const week = page.getByRole('listitem').filter({ hasText: 'Uma semana de ofensiva' });
  await expect(week.getByText('Bloqueada')).toBeVisible();
});

test.describe('with reduced motion', () => {
  test.use({ reducedMotion: 'reduce' });

  test('the celebration still shows, without confetti', async ({ page }) => {
    await signUpWithContext(page, newUser('Calma'));
    await quickCreate(page, 'Ler um capítulo');
    await quickCreate(page, 'Tomar água');
    await finish(page, 'Ler um capítulo');
    await expect(celebration(page).getByText('Conquista: Primeira tarefa')).toBeVisible();
    await expect(confetti(page)).toHaveCount(0);
  });
});

test('the ranking: on by default in a family group, off in a company until an admin turns it on', async ({
  page,
}) => {
  await signUp(page, newUser('Rank'));
  await expect(page.getByRole('heading', { name: 'Hoje', exact: true })).toBeVisible();

  // Family: on, with the week's XP from the group's tasks
  const family = await newGroup(page, 'Família R');
  await expect(text(page, 'Ranking da semana')).toBeVisible();
  await expect(page.getByRole('switch', { name: 'Ranking no grupo' })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  await expect(text(page, 'Ninguém ganhou XP com tarefas deste grupo esta semana.')).toBeVisible();
  await newContext(page, 'Casa R', 'Família R');
  await quickCreate(page, 'Lavar o carro');
  await finish(page, 'Lavar o carro');
  await page.goto(family);
  const row = page.getByRole('listitem').filter({ hasText: 'Rank' });
  await expect(row.getByText('1º')).toBeVisible();
  await expect(row.getByText('10 XP')).toBeVisible();

  // Company: off by default, explained, and the owner can turn it on
  await newGroup(page, 'Empresa R', 'Empresa');
  const toggle = page.getByRole('switch', { name: 'Ranking no grupo' });
  await expect(toggle).toHaveAttribute('aria-checked', 'false');
  await expect(text(page, 'O ranking está desligado neste grupo.')).toBeVisible();
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-checked', 'true');
  await expect(text(page, 'Ninguém ganhou XP com tarefas deste grupo esta semana.')).toBeVisible();
});

test('at the daily cap a finished task writes no XP and is not celebrated, and the profile says so', async ({
  page,
}) => {
  const user = newUser('Teto');
  await signUpWithContext(page, user);
  const id = userId(user);
  // 300 already earned today, as the database would have written it.
  sql(
    `insert into public.xp_events (user_id, amount, reason) values ('${id}', 300, 'occurrence_done')`,
  );
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Hoje', exact: true })).toBeVisible();
  // Two tasks, so finishing one does not make the day perfect, which is outside the cap.
  await quickCreate(page, 'Passear com o cão');
  await quickCreate(page, 'Ligar para a avó');
  await finish(page, 'Passear com o cão');
  await expect(goal(page)).toHaveAttribute('aria-valuetext', '1 de 2');

  expect(sql(`select count(*) from public.xp_events where user_id = '${id}'`)).toEqual(['1']);
  // Past the burst window, nothing to celebrate.
  await page.waitForTimeout(2_000);
  await expect(celebration(page)).toHaveCount(0);

  await page.getByRole('tab', { name: 'Perfil' }).click();
  await expect(
    page.getByText(
      'Você atingiu o limite de 300 XP de hoje. As tarefas continuam contando para a meta e a ofensiva.',
    ),
  ).toBeVisible();
});
