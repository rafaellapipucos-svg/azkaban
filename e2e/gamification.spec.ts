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
  // The notice of the one before may still be up: the task itself is the proof.
  await expect(check(page, title, 'Pendente')).toBeVisible();
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

const emptyRanking =
  'Ninguém ganhou XP com tarefas deste grupo esta semana. O ranking conta a partir de quando foi ligado e de quando você entrou no grupo.';

const userId = (user: User) => sql(`select id from auth.users where email = '${user.email}'`)[0]!;

test('finishing tasks: XP, the celebration with confetti, the goal ring, the streak and the first achievement', async ({
  page,
}) => {
  await signUpWithContext(page, newUser('Gami'));
  await quickCreate(page, 'Regar as plantas');
  await quickCreate(page, 'Arrumar a cama');
  await expect(goal(page)).toHaveAttribute('aria-valuetext', '0 de 2');
  await expect(page.getByRole('button', { name: '0 dias de ofensiva' })).toBeVisible();

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
  // "Últimos dias" starts on the day the account was made, today (QA6-5).
  const days = text(page, 'Últimos dias').locator('xpath=following-sibling::*[@role="list"]');
  await expect(days.getByRole('listitem')).toHaveCount(1);
  await expect(days.getByRole('listitem')).toHaveText(/: Dia perfeito$/);
});

// QA6C-1, handoff 20261103-0453-qa-testes-para-gamificacao-cartao-bloqueia-a-tela: the card's
// full-screen wrapper takes every tap while the card is up (6 s), so nothing else on the screen
// works. Remove `test.fail()` when it is fixed.
test('while the celebration card is up, the rest of Hoje still takes taps', async ({ page }) => {
  test.fail();
  await signUpWithContext(page, newUser('Toque'));
  await quickCreate(page, 'Varrer a sala');
  await quickCreate(page, 'Tirar o lixo');
  await finish(page, 'Varrer a sala');
  await expect(celebration(page)).toHaveCount(1);
  // Well inside the card's 6 s, and far from it.
  await check(page, 'Tirar o lixo', 'Pendente').click({ timeout: 2_000 });
  await expect(check(page, 'Tirar o lixo', 'Feito')).toBeVisible();
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
  const user = newUser('Rank');
  await signUp(page, user);
  await expect(page.getByRole('heading', { name: 'Hoje', exact: true })).toBeVisible();
  const id = userId(user);

  // Family: on, with the week's XP from the group's tasks
  const family = await newGroup(page, 'Família R');
  await expect(text(page, 'Ranking da semana')).toBeVisible();
  await expect(page.getByRole('switch', { name: 'Ranking no grupo' })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  await expect(text(page, emptyRanking)).toBeVisible();
  await newContext(page, 'Casa R', 'Família R');
  await quickCreate(page, 'Lavar o carro');
  await finish(page, 'Lavar o carro');
  await page.goto(family);
  const row = page.getByRole('listitem').filter({ hasText: 'Rank' });
  await expect(row.getByText('1º')).toBeVisible();
  await expect(row.getByText('10 XP')).toBeVisible();

  // Only the current week (SEG6-4): with the group on and the member in it for a month, 50 XP from 8
  // days ago, always before this week's start, stay out. The trigger owns `ranking_enabled_at`.
  const [familyId] = sql(
    `select m.group_id from public.group_members m join public.groups g on g.id = m.group_id
     where m.user_id = '${id}' and g.name = 'Família R'`,
  );
  sql(`begin;
    alter table public.groups disable trigger groups_set_ranking_enabled_at;
    update public.groups set ranking_enabled_at = now() - interval '30 days' where id = '${familyId}';
    alter table public.groups enable trigger groups_set_ranking_enabled_at;
    update public.group_members set joined_at = now() - interval '30 days'
      where group_id = '${familyId}' and user_id = '${id}';
    insert into public.xp_events (user_id, group_id, amount, reason, created_at)
      values ('${id}', '${familyId}', 50, 'occurrence_done', now() - interval '8 days');
    commit;`);
  await page.reload();
  await expect(row.getByText('10 XP')).toBeVisible();

  // Company: off by default, explained, and the owner can turn it on
  const company = await newGroup(page, 'Empresa R', 'Empresa');
  const toggle = page.getByRole('switch', { name: 'Ranking no grupo' });
  await expect(toggle).toHaveAttribute('aria-checked', 'false');
  await expect(text(page, 'O ranking está desligado neste grupo.')).toBeVisible();
  // XP earned in the group while the ranking is off does not count once it is on (SEG6-4).
  await newContext(page, 'Escritório R', 'Empresa R');
  await quickCreate(page, 'Enviar o relatório');
  await finish(page, 'Enviar o relatório');
  expect(
    sql(`select count(*) from public.xp_events where user_id = '${id}' and group_id is not null`),
  ).toEqual(['3']);
  await page.goto(company);
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-checked', 'true');
  await expect(text(page, emptyRanking)).toBeVisible();
});

test('at the daily cap a finished task writes no XP and is not celebrated, and the profile says so', async ({
  page,
}) => {
  const user = newUser('Teto');
  await signUpWithContext(page, user);
  const id = userId(user);
  // 300 earned within the last 24 hours, as the database would have written it. The window moves, so
  // this holds at any hour, midnight included. "Primeira tarefa" is granted apart from the XP, so it
  // is given beforehand: its card would be a celebration of its own.
  sql(`begin;
    insert into public.xp_events (user_id, amount, reason) values ('${id}', 300, 'occurrence_done');
    insert into public.user_achievements (user_id, achievement_key) values ('${id}', 'first_task');
    commit;`);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Hoje', exact: true })).toBeVisible();
  // Five tasks: four meet the goal (80%, so the ring counts to 4) without making the day perfect,
  // which is outside the cap.
  const titles = ['Passear com o cão', 'Ligar para a avó', 'Pagar a luz', 'Molhar a horta', 'Ler'];
  for (const title of titles) await quickCreate(page, title);
  await finish(page, titles[0]!);
  await expect(goal(page)).toHaveAttribute('aria-valuetext', '1 de 4');

  expect(sql(`select count(*) from public.xp_events where user_id = '${id}'`)).toEqual(['1']);
  // Past the burst window, nothing to celebrate. Counted once: `toHaveCount(0)` would retry until a
  // card closed by itself.
  await page.waitForTimeout(2_000);
  expect(await celebration(page).count()).toBe(0);

  // The goal met moves the streak with no XP and no achievement, so nothing comes by Realtime, and
  // the chip still follows (QA6-3).
  for (const title of titles.slice(1, 4)) await finish(page, title);
  await expect(goal(page)).toHaveAttribute('aria-valuetext', '4 de 4');
  await expect(page.getByRole('button', { name: '1 dia de ofensiva' })).toBeVisible();
  expect(sql(`select count(*) from public.xp_events where user_id = '${id}'`)).toEqual(['1']);
  expect(sql(`select count(*) from public.user_achievements where user_id = '${id}'`)).toEqual([
    '1',
  ]);

  await page.getByRole('tab', { name: 'Perfil' }).click();
  await expect(
    page.getByText(
      'Você atingiu o limite de 300 XP nas últimas 24 horas. As tarefas continuam contando para a meta e a ofensiva.',
    ),
  ).toBeVisible();
});
