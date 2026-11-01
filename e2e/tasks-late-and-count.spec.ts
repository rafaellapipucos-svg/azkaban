import { randomUUID } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';

// Needs `pnpm db:start` and `pnpm exec supabase functions serve` (repeating tasks are materialized
// by the Edge Function). Accounts are unique per run and exist only in the local database.
const button = (page: Page, name: string) =>
  page.getByRole('button', { name, exact: true }).locator('visible=true');

// Days are those of the profile zone, Sao Paulo by default, never the machine's.
const ZONE = 'America/Sao_Paulo';
const todayLocal = () => new Intl.DateTimeFormat('en-CA', { timeZone: ZONE }).format(new Date());
const plusDays = (date: string, days: number) =>
  new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);

async function signUpWithContext(page: Page, name: string) {
  await page.goto('/sign-up');
  await page.getByLabel('Seu nome').fill(name);
  await page
    .getByLabel('E-mail', { exact: true })
    .fill(`${name.toLowerCase()}-${randomUUID()}@example.com`);
  await page.getByLabel('Senha').fill(randomUUID());
  await button(page, 'Criar conta').first().click();
  await button(page, 'Novo contexto').click();
  await page.getByLabel('Nome', { exact: true }).fill('Casa');
  await button(page, 'Salvar').click();
  await expect(page.getByRole('heading', { name: 'Hoje', exact: true })).toBeVisible();
}

/** A one-off task on a given day, through the full form (the quick form only does today or tomorrow). */
async function createOn(page: Page, title: string, day: string) {
  await page.goto(`/tasks/new?day=${day}&time=09:00`);
  await page.getByLabel('O que precisa ser feito?').fill(title);
  await button(page, 'Salvar').click();
  await expect(page.getByRole('heading', { name: 'Hoje', exact: true })).toBeVisible();
}

/** A daily series that ends after `count` times, from today. */
async function createCountedSeries(page: Page, title: string, count: number) {
  await button(page, 'Nova tarefa').click();
  await page.getByLabel('O que precisa ser feito?').fill(title);
  await button(page, 'Mais opções').click();
  await page.getByRole('switch', { name: 'Repetir' }).click();
  await page.getByRole('radio', { name: 'N vezes' }).click();
  // The stepper starts at 10; the second one on the form is the count
  const less = page.getByRole('button', { name: /^Diminuir/ }).last();
  for (let i = 0; i < 10 - count; i += 1) await less.click();
  await expect(page.getByText(`${count} vezes`, { exact: true })).toBeVisible();
  await button(page, 'Salvar').click();
  await expect(page.getByRole('heading', { name: 'Hoje', exact: true })).toBeVisible();
}

const rows = (page: Page, title: string) =>
  page.getByRole('checkbox', { name: `${title}: Pendente` }).locator('visible=true');

test('a task overdue inside the late window counts as done late, and past it only "Não fiz" is offered', async ({
  page,
}) => {
  await signUpWithContext(page, 'Atraso');
  const today = todayLocal();
  await createOn(page, 'Ontem sem fazer', plusDays(today, -1));
  await createOn(page, 'Há cinco dias', plusDays(today, -5));

  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Atrasadas' })).toBeVisible();

  // Five days late is past the 72 hours of lateCompletionWindowHours: no way to say "feito"
  await page.getByText('Há cinco dias', { exact: true }).first().click();
  await expect(page.getByRole('heading', { name: 'Há cinco dias' })).toBeVisible();
  await expect(button(page, 'Não fiz')).toBeVisible();
  await expect(button(page, 'Marcar como feito')).toHaveCount(0);
  await page.goBack();

  // Yesterday is inside the window: it says so, and the result is done late
  await page.getByText('Ontem sem fazer', { exact: true }).first().click();
  await expect(page.getByText('Fora do prazo: conta como feito com atraso.')).toBeVisible();
  await button(page, 'Marcar como feito').click();
  await expect(page.getByText('Pendente → Feito')).toBeVisible();
  await expect(page.getByText('Feita depois do prazo.')).toBeVisible();
});

test('a screen that still thinks the window is open gets the late_window_expired message', async ({
  page,
}) => {
  await signUpWithContext(page, 'Janela');
  const due = plusDays(todayLocal(), -5);
  await createOn(page, 'Fora da janela', due);
  await page.goto('/');
  await page.getByText('Fora da janela', { exact: true }).first().click();
  await expect(page.getByRole('heading', { name: 'Fora da janela' })).toBeVisible();
  const detail = page.url();

  // Move this browser's clock back to the day after the due day: the screen offers "feito", the
  // database, on the real clock, refuses
  await page.clock.setFixedTime(new Date(`${plusDays(due, 1)}T15:00:00Z`));
  await page.goto(detail);
  await button(page, 'Marcar como feito').click();
  await expect(
    page.getByText('O prazo para marcar esta tarefa como feita acabou. Peça a um administrador.'),
  ).toBeVisible();
  await expect(page.getByText('Pendente → Feito')).toHaveCount(0);
});

test('this and the following keeps the total of a series that ends after N times', async ({
  page,
}) => {
  await signUpWithContext(page, 'Total');
  await createCountedSeries(page, 'Curso', 5);
  await page.goto('/area/work');
  await expect(rows(page, 'Curso')).toHaveCount(5);

  // Open the third day (the page was opened by address, so only this tab's rows are on it)
  await page.getByText('Curso', { exact: true }).nth(2).click();
  await button(page, 'Editar').click();
  await button(page, 'Esta e as próximas').click();
  await page.getByLabel('O que precisa ser feito?').fill('Curso novo');
  await button(page, 'Salvar').click();
  await expect(page.getByRole('heading', { name: 'Editar tarefa' })).toHaveCount(0);

  // Two days stay with the old name and three go to the new one: still five in all
  await page.goto('/area/work');
  await expect(rows(page, 'Curso')).toHaveCount(2);
  await expect(rows(page, 'Curso novo')).toHaveCount(3);
});

test('this and the following refuses a count that does not pass the days already gone', async ({
  page,
}) => {
  await signUpWithContext(page, 'Pivo');
  await createCountedSeries(page, 'Aula', 5);
  await page.goto('/area/work');
  await expect(rows(page, 'Aula')).toHaveCount(5);

  await page.getByText('Aula', { exact: true }).nth(2).click();
  await button(page, 'Editar').click();
  await button(page, 'Esta e as próximas').click();
  const less = page.getByRole('button', { name: /^Diminuir/ }).last();
  for (let i = 0; i < 3; i += 1) await less.click();
  await expect(page.getByText('2 vezes', { exact: true })).toBeVisible();
  await button(page, 'Salvar').click();
  await expect(
    page.getByText('O número de vezes é menor do que o que já passou. Aumente o número.'),
  ).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Editar tarefa' })).toBeVisible();
});

// BUG (qa-phase-2, handoff to tarefas-calendario): saving "this and the following" from a day
// after the first deletes the occurrence that was open, and the form goes back to its detail screen,
// which now says it cannot find the task. Remove `test.fail` when the screen lands somewhere that exists.
test.fail(
  'after this and the following the user does not land on a "task not found" screen',
  async ({ page }) => {
    await signUpWithContext(page, 'Perdida');
    await createCountedSeries(page, 'Oficina', 5);
    await page.goto('/area/work');
    await expect(rows(page, 'Oficina')).toHaveCount(5);

    await page.getByText('Oficina', { exact: true }).nth(2).click();
    await button(page, 'Editar').click();
    await button(page, 'Esta e as próximas').click();
    await page.getByLabel('O que precisa ser feito?').fill('Oficina nova');
    await button(page, 'Salvar').click();
    await expect(page.getByRole('heading', { name: 'Editar tarefa' })).toHaveCount(0);
    await expect(page.getByText('Não encontramos esta tarefa.')).toHaveCount(0);
  },
);
