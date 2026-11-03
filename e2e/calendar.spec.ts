import { randomUUID } from 'node:crypto';
import { expect, test, type Browser, type Page } from '@playwright/test';

// Needs `pnpm db:start`, which serves the functions too (repeating tasks are materialized
// by the Edge Function). Accounts are unique per run and exist only in the local database.
const newUser = (name: string) => ({
  name,
  email: `${name.toLowerCase()}-${randomUUID()}@example.com`,
  password: randomUUID(),
});
type User = ReturnType<typeof newUser>;

const button = (page: Page, name: string) =>
  page.getByRole('button', { name, exact: true }).locator('visible=true');

// Days are those of the profile zone, Sao Paulo by default, never the machine's.
const ZONE = 'America/Sao_Paulo';
const todayLocal = () => new Intl.DateTimeFormat('en-CA', { timeZone: ZONE }).format(new Date());
const plusDays = (date: string, days: number) =>
  new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
const longDay = (date: string) =>
  new Intl.DateTimeFormat('pt-BR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  }).format(new Date(`${date}T12:00:00Z`));

/** The month cell of a day: its spoken label starts with the long date. */
const dayCell = (page: Page, date: string) =>
  page.getByRole('button', { name: new RegExp(`^${longDay(date)}, `) }).locator('visible=true');

async function signUp(page: Page, user: User) {
  await page.goto('/sign-up');
  await page.getByLabel('Seu nome').fill(user.name);
  await page.getByLabel('E-mail', { exact: true }).fill(user.email);
  await page.getByLabel('Senha').fill(user.password);
  await button(page, 'Criar conta').first().click();
  await expect(page.getByRole('heading', { name: 'Hoje', exact: true })).toBeVisible();
}

async function newContext(page: Page, name: string, group?: string) {
  await page.goto('/contexts/new');
  await page.getByLabel('Nome', { exact: true }).fill(name);
  // The area is chosen when the list of areas arrives; Salvar before that does nothing
  await expect(page.getByRole('radio', { name: /Trabalho/ })).toBeChecked();
  if (group) await page.getByRole('radio', { name: group }).click();
  await button(page, 'Salvar').click();
  await expect(page.getByRole('heading', { name: 'Hoje', exact: true })).toBeVisible();
}

/** A new account that owns a group with one group context. Returns the invite code too. */
async function ownerOfGroup(browser: Browser, name: string, group: string, context: string) {
  const page = await (await browser.newContext()).newPage();
  await signUp(page, newUser(name));
  await page.goto('/groups/new');
  await page.getByLabel('Nome do grupo').fill(group);
  await button(page, 'Criar grupo').click();
  await button(page, 'Convidar membro').click();
  const code = await page.getByRole('heading', { name: /^[A-Z2-9]{10}$/ }).innerText();
  const groupId = new URL(page.url()).pathname.split('/').pop()!;
  await newContext(page, context, group);
  return { page, code, groupId };
}

async function joinNewMember(browser: Browser, name: string, code: string) {
  const user = newUser(name);
  const page = await (await browser.newContext()).newPage();
  await page.goto(`/join/${code}`);
  await button(page, 'Entrar').click();
  await button(page, 'Criar conta').click();
  await page.getByLabel('Seu nome').fill(user.name);
  await page.getByLabel('E-mail', { exact: true }).fill(user.email);
  await page.getByLabel('Senha').fill(user.password);
  await button(page, 'Criar conta').first().click();
  await button(page, 'Aceitar').click();
  await expect(page.getByText('Dona').or(page.getByText('Bia'))).toBeVisible();
  return page;
}

/** Creates a task through the full form, prefilled with a day and a time like the calendar does. */
async function createTask(
  page: Page,
  title: string,
  { day, time, assignee }: { day?: string; time?: string; assignee?: string } = {},
) {
  const params = new URLSearchParams();
  if (day) params.set('day', day);
  if (time) params.set('time', time);
  await page.goto(`/tasks/new?${params}`);
  await page.getByLabel('O que precisa ser feito?').fill(title);
  if (assignee) {
    await page.getByRole('checkbox', { name: assignee }).click();
    await page.getByRole('checkbox', { name: 'Eu' }).click();
  }
  await button(page, 'Salvar').click();
  await expect(page.getByRole('heading', { name: 'Hoje', exact: true })).toBeVisible();
}

const openCalendar = (page: Page, query: string) => page.goto(`/calendar?${query}`);

test('a task appears on its day, and two green tasks make a perfect day', async ({ page }) => {
  await signUp(page, newUser('Calendaria'));
  await newContext(page, 'Casa');
  const day = plusDays(todayLocal(), 2);
  const other = plusDays(day, 1);

  // Creating from the calendar's "new task" carries the day and the time into the form
  await createTask(page, 'Tarefa um', { day, time: '10:00' });
  await createTask(page, 'Tarefa dois', { day, time: '15:30' });

  await openCalendar(page, `date=${day}`);
  await expect(dayCell(page, day)).toHaveAttribute(
    'aria-label',
    `${longDay(day)}, 2 tarefas: 2 pendentes`,
  );
  await expect(dayCell(page, other)).toHaveAttribute(
    'aria-label',
    `${longDay(other)}, sem tarefas`,
  );

  // The calendar sits between the areas and Perfil
  const tabs = ['Hoje', 'Trabalho', 'Doméstico', 'Calendário', 'Perfil'];
  for (const [index, name] of tabs.entries()) {
    await expect(page.getByRole('tab').nth(index)).toHaveAttribute('aria-label', name);
  }

  // The status filter hides what does not match, and clearing it brings the tasks back
  await button(page, 'Filtros').click();
  await page
    .getByRole('radiogroup', { name: 'Estado' })
    .getByRole('radio', { name: 'Feito', exact: true })
    .click();
  await expect(dayCell(page, day)).toHaveAttribute('aria-label', `${longDay(day)}, sem tarefas`);
  await button(page, 'Limpar filtros').click();
  await expect(dayCell(page, day)).toHaveAttribute(
    'aria-label',
    `${longDay(day)}, 2 tarefas: 2 pendentes`,
  );

  // The tapped day lists its tasks, in time order, with their times
  await dayCell(page, other).click();
  await expect(page.getByText('Nada marcado para este dia.')).toBeVisible();
  await dayCell(page, day).click();
  await expect(page.getByRole('button', { name: /^Tarefa um, 10:00/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Tarefa dois, 15:30/ })).toBeVisible();

  // One done: not perfect yet
  await page.getByRole('button', { name: /^Tarefa um, / }).click();
  await button(page, 'Marcar como feito').click();
  await expect(page.getByText('Pendente → Feito')).toBeVisible();
  await openCalendar(page, `date=${day}`);
  await expect(dayCell(page, day)).toHaveAttribute(
    'aria-label',
    `${longDay(day)}, 2 tarefas: 1 pendente, 1 feita`,
  );
  await expect(page.getByText('Dia perfeito! Tudo feito neste dia.')).toHaveCount(0);

  // Both done: the day is perfect, marked on the cell and highlighted below
  await page.getByRole('button', { name: /^Tarefa dois, / }).click();
  await button(page, 'Marcar como feito').click();
  await expect(page.getByText('Pendente → Feito')).toBeVisible();
  await openCalendar(page, `date=${day}`);
  await expect(dayCell(page, day)).toHaveAttribute(
    'aria-label',
    `${longDay(day)}, 2 tarefas: 2 feitas, dia perfeito`,
  );
  await expect(page.getByText('Dia perfeito! Tudo feito neste dia.')).toBeVisible();
});

test('creating from a day or an hour prefills the date and the time', async ({ page }) => {
  await signUp(page, newUser('Criadora'));
  await newContext(page, 'Casa');
  const day = plusDays(todayLocal(), 3);

  // From the tapped day in the month view
  await openCalendar(page, `date=${day}`);
  await button(page, 'Nova tarefa neste dia').click();
  await expect(page.locator('input[type="date"]')).toHaveValue(day);
  await expect(page.locator('input[type="time"]')).toHaveValue('09:00');

  // From an hour of the day view
  await openCalendar(page, `date=${day}&view=day`);
  await expect(page.getByText('Nenhum prazo vence neste dia.')).toBeVisible();
  await button(page, 'Nova tarefa às 14:00').click();
  await expect(page.locator('input[type="date"]')).toHaveValue(day);
  await expect(page.locator('input[type="time"]')).toHaveValue('14:00');
  await page.getByLabel('O que precisa ser feito?').fill('Reunião');
  await button(page, 'Salvar').click();
  // Leaving before the save ends aborts it (and the navigation, with ERR_ABORTED): it goes back
  // to the calendar it came from
  await expect(page.getByRole('heading', { name: 'Calendário', exact: true })).toBeVisible();

  // It shows on that hour of that day
  await openCalendar(page, `date=${day}&view=day`);
  await expect(page.getByRole('button', { name: /^Reunião, 14:00/ })).toBeVisible();
});

test('a repeating task shows far ahead, and past the limit the screen explains', async ({
  page,
}) => {
  await signUp(page, newUser('Longe'));
  await newContext(page, 'Casa');
  await page.goto('/tasks/new');
  await page.getByLabel('O que precisa ser feito?').fill('Treino diário');
  await button(page, 'Mais opções').click();
  await page.getByRole('switch', { name: 'Repetir' }).click();
  await button(page, 'Salvar').click();
  await expect(page.getByRole('heading', { name: 'Hoje', exact: true })).toBeVisible();

  // 90 days is past the 60-day window the daily job keeps: the calendar asks for more
  const far = plusDays(todayLocal(), 90);
  await openCalendar(page, `date=${far}&view=day`);
  await expect(page.getByRole('button', { name: /^Treino diário, / })).toBeVisible({
    timeout: 20_000,
  });

  // Past one year the function cannot go: the screen says so and does not break
  const beyond = plusDays(todayLocal(), 500);
  await openCalendar(page, `date=${beyond}&view=day`);
  await expect(page.getByText(/^Tarefas que se repetem aparecem até /)).toBeVisible();
  await expect(page.getByText('Nenhum prazo vence neste dia.')).toBeVisible();
  await expect(page.getByRole('button', { name: /^Treino diário, / })).toHaveCount(0);
  // Within the year there is no notice
  await openCalendar(page, `date=${far}&view=day`);
  await expect(page.getByText(/^Tarefas que se repetem aparecem até /)).toHaveCount(0);
});

test('the admin sees a member calendar and the team view; the member cannot', async ({
  browser,
}) => {
  const { page: owner, code, groupId } = await ownerOfGroup(browser, 'Dona', 'Equipe C', 'Loja');
  const member = await joinNewMember(browser, 'Duda', code);

  await createTask(owner, 'Relatório', { assignee: 'Duda' });
  await member.goto('/');
  // "Feito" shows before the save commits; the owner's team view reads the database
  const saved = member.waitForResponse(
    (r) => r.url().includes('/rpc/set_occurrence_status') && r.ok(),
  );
  await member.getByRole('checkbox', { name: 'Relatório: Pendente' }).click();
  await expect(member.getByRole('checkbox', { name: 'Relatório: Feito' })).toBeVisible();
  await saved;

  // Team view, from the group's page
  await owner.goto(`/groups/${groupId}`);
  await button(owner, 'Ver equipe').click();
  await expect(owner.getByRole('heading', { name: 'Equipe', exact: true })).toBeVisible();
  const card = owner.getByRole('button', { name: /^Duda\. Em dia: 100%/ });
  await expect(card).toBeVisible();
  await expect(card).toHaveAttribute('aria-label', /1 de 1 feitas, tudo feito/);

  // Tapping the member opens that person's calendar, in the week of the team view
  await card.click();
  await expect(owner.getByText('Calendário de Duda, no grupo Equipe C')).toBeVisible();
  await expect(owner.getByRole('button', { name: /^Relatório, / })).toBeVisible();

  // The whole team, with the name of who each task belongs to
  await owner.getByRole('radio', { name: 'Time inteiro' }).click();
  await expect(owner.getByText('Time inteiro do grupo Equipe C')).toBeVisible();
  await expect(owner.getByRole('button', { name: /^Relatório, .*Duda/ })).toBeVisible();

  // And back to her own calendar, which has no task of Duda's
  await owner.getByRole('radio', { name: 'Meu calendário' }).click();
  await expect(owner.getByRole('button', { name: /^Relatório, / })).toHaveCount(0);

  // The member has no team view and no choice of whose calendar to see
  await member.goto(`/team/${groupId}`);
  await expect(
    member.getByText('Só quem pode ver as tarefas do grupo acessa a equipe.'),
  ).toBeVisible();
  await member.goto(`/groups/${groupId}`);
  await expect(member.getByText('Dona')).toBeVisible();
  await expect(button(member, 'Ver equipe')).toHaveCount(0);
  await openCalendar(member, 'view=week');
  await expect(member.getByRole('radiogroup', { name: 'Visão do calendário' })).toBeVisible();
  await expect(member.getByRole('radiogroup', { name: 'De quem é o calendário' })).toHaveCount(0);
});

test('an admin sees nothing from another group or from personal tasks', async ({ browser }) => {
  const a = await ownerOfGroup(browser, 'Dona', 'Casa A', 'Sala A');
  const b = await ownerOfGroup(browser, 'Bia', 'Casa B', 'Sala B');
  const duda = await joinNewMember(browser, 'Duda', a.code);
  // Duda also works for Bia: a second group, that the admin of Casa A is not part of
  await duda.goto(`/join/${b.code}`);
  await button(duda, 'Aceitar').click();
  await expect(duda.getByText('Bia')).toBeVisible();

  await createTask(a.page, 'Tarefa da Casa A', { assignee: 'Duda' });
  await createTask(b.page, 'Tarefa da Casa B', { assignee: 'Duda' });
  await newContext(duda, 'Meu diário');
  await duda.goto('/tasks/new');
  await duda.getByLabel('O que precisa ser feito?').fill('Segredo da Duda');
  await duda.getByRole('radio', { name: /Meu diário/ }).click();
  await button(duda, 'Salvar').click();
  await expect(
    duda.getByText('Segredo da Duda', { exact: true }).locator('visible=true'),
  ).toBeVisible();

  const week = (name: string) => new RegExp(`^${name}, `);
  const hidden = ['Tarefa da Casa B', 'Segredo da Duda'];

  // The calendar of Duda, from Casa A
  await openCalendar(a.page, `scope=member&group=${a.groupId}&view=week`);
  await expect(a.page.getByRole('button', { name: week('Tarefa da Casa A') })).toBeVisible();
  for (const title of hidden) {
    await expect(a.page.getByRole('button', { name: week(title) })).toHaveCount(0);
  }

  // The whole team of Casa A
  await openCalendar(a.page, `scope=team&group=${a.groupId}&view=week`);
  await expect(a.page.getByRole('button', { name: week('Tarefa da Casa A') })).toBeVisible();
  for (const title of hidden) {
    await expect(a.page.getByRole('button', { name: week(title) })).toHaveCount(0);
  }

  // The team view counts only what belongs to Casa A: one task today, not three
  await a.page.goto(`/team/${a.groupId}`);
  const card = a.page.getByRole('button', { name: /^Duda\./ });
  await expect(card).toHaveAttribute('aria-label', /0 de 1 feitas/);
  await expect(card).not.toHaveAttribute('aria-label', /0 de [23] feitas/);

  // Bia's side is just as closed: Casa A's task never reaches her
  await openCalendar(b.page, `scope=team&group=${b.groupId}&view=week`);
  await expect(b.page.getByRole('button', { name: week('Tarefa da Casa B') })).toBeVisible();
  await expect(b.page.getByRole('button', { name: week('Tarefa da Casa A') })).toHaveCount(0);
  await expect(b.page.getByRole('button', { name: week('Segredo da Duda') })).toHaveCount(0);

  // An admin cannot open the team view of a group she is not in
  await a.page.goto(`/team/${b.groupId}`);
  await expect(
    a.page.getByText('Só quem pode ver as tarefas do grupo acessa a equipe.'),
  ).toBeVisible();
});

test('the month grid fits a 375px screen with 44px targets and no sideways scroll', async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await signUp(page, newUser('Estreita'));
  await newContext(page, 'Casa');
  await openCalendar(page, `date=${plusDays(todayLocal(), 1)}`);

  const weekdays = 'domingo|segunda-feira|terça-feira|quarta-feira|quinta-feira|sexta-feira|sábado';
  const cells = page.getByRole('button', { name: new RegExp(`^(${weekdays}), \\d`) });
  await expect(cells.first()).toBeVisible();
  const count = await cells.count();
  expect(count % 7).toBe(0);
  expect(count).toBeGreaterThanOrEqual(28);
  for (let index = 0; index < count; index += 1) {
    const box = (await cells.nth(index).boundingBox())!;
    expect(box.width).toBeGreaterThanOrEqual(44);
    expect(box.height).toBeGreaterThanOrEqual(44);
    expect(box.x + box.width).toBeLessThanOrEqual(375);
  }
  const overflow = await page
    .locator('html')
    .evaluate((root) => root.scrollWidth - root.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});
