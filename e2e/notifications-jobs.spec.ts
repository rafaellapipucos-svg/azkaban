import { randomUUID } from 'node:crypto';
import { expect, test, type Locator, type Page } from '@playwright/test';
import {
  admin,
  cleanUp,
  newAuthor,
  newGroup,
  type Group,
} from '../supabase/functions/_shared/proof-kit';
import { button, check, clientOf, newUser, sendProof, signUp } from './proof-fixtures';

// Needs `pnpm db:start`. The two SQL jobs of ADR-0008 (red by default, section 10; reminders,
// section 4) are called directly, because the test cannot wait for pg_cron. Both are global: they
// act on every row of the database, as the cron tick does, so the other specs that keep a past
// occurrence pending shield it first (`shieldFromAutoMiss` in proof-fixtures).

const ZONE = 'America/Sao_Paulo';
const todayLocal = () => new Intl.DateTimeFormat('en-CA', { timeZone: ZONE }).format(new Date());
const plusDays = (date: string, days: number) =>
  new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
// 09:00 in Sao Paulo, which has no daylight saving time
const nineAm = (date: string) => `${date}T12:00:00.000Z`;

const bell = (page: Page, unread: number) =>
  page.getByRole('button', {
    name: unread === 0 ? 'Avisos' : `Avisos, ${unread} ${unread === 1 ? 'não lido' : 'não lidos'}`,
    exact: true,
  });

/** The live notice. Its `role="status"` region is always mounted; only the content changes. */
const toastOf = (page: Page) => page.getByTestId('notification-toast');

/** The center of `target` hits `target` itself, and not a notice drawn over it. */
const uncovered = (target: Locator) =>
  target.evaluate((element) => {
    const box = element.getBoundingClientRect();
    const hit = element.ownerDocument.elementFromPoint(
      box.x + box.width / 2,
      box.y + box.height / 2,
    );
    return hit !== null && element.contains(hit);
  });

/** Signed up through the screens, with a personal context. Returns the ids. */
async function signedUp(page: Page) {
  const user = newUser(`Rubi${randomUUID().slice(0, 6)}`);
  await signUp(page, user);
  await button(page, 'Novo contexto').click();
  await page.getByLabel('Nome', { exact: true }).fill('Casa');
  await button(page, 'Salvar').click();
  await expect(page.getByRole('heading', { name: 'Hoje', exact: true })).toBeVisible();
  const profile = await admin.from('profiles').select('id').eq('display_name', user.name).single();
  const id = profile.data!.id as string;
  const context = await admin.from('contexts').select('id').eq('created_by', id).single();
  return { id, contextId: context.data!.id as string };
}

type TaskSpec = {
  contextId: string;
  createdBy: string;
  assigneeId: string;
  startAt: string;
  reminders?: number[];
  photo?: boolean;
  approval?: boolean;
  /** A personal context takes only private tasks. */
  visibility: 'group' | 'private';
};

/** A one-off timed task, as the app inserts it. Returns its title and single occurrence. */
async function oneOff(spec: TaskSpec) {
  const title = `Job ${randomUUID().slice(0, 8)}`;
  const task = await admin
    .from('tasks')
    .insert({
      context_id: spec.contextId,
      created_by: spec.createdBy,
      assignee_id: spec.assigneeId,
      title,
      schedule_type: 'timed',
      start_at: spec.startAt,
      duration_min: 30,
      timezone: ZONE,
      rrule: null,
      reminders: spec.reminders ?? [],
      requires_photo_proof: spec.photo ?? false,
      requires_admin_approval: spec.approval ?? false,
      requires_partial_reason: false,
      difficulty: 'easy',
      priority: 'normal',
      visibility: spec.visibility,
    })
    .select('id')
    .single();
  expect(task.error).toBeNull();
  const occurrence = await admin
    .from('task_occurrences')
    .select('id')
    .eq('task_id', task.data!.id)
    .single();
  return { title, taskId: task.data!.id as string, occurrenceId: occurrence.data!.id as string };
}

async function occurrence(id: string) {
  const { data } = await admin
    .from('task_occurrences')
    .select('status, late, proof_review_status')
    .eq('id', id)
    .single();
  return data!;
}

async function history(id: string) {
  const { data } = await admin
    .from('task_status_history')
    .select('from_status, to_status, changed_by')
    .eq('occurrence_id', id)
    .order('changed_at');
  return data!;
}

async function noticesOf(userId: string, occurrenceId: string) {
  const { data } = await admin
    .from('notifications')
    .select('type, data')
    .eq('user_id', userId)
    .eq('occurrence_id', occurrenceId);
  return data!;
}

async function xpOf(occurrenceId: string) {
  const { data } = await admin
    .from('xp_events')
    .select('amount, reason')
    .eq('occurrence_id', occurrenceId);
  return data!;
}

async function setStatus(userId: string, occurrenceId: string, from: string, to: string) {
  const { error } = await clientOf(userId).rpc('set_occurrence_status', {
    p_occurrence_id: occurrenceId,
    p_to_status: to,
    p_expected_status: from,
    p_reason: null,
  });
  expect(error).toBeNull();
}

let groups: Group[] = [];
test.afterAll(async () => {
  await cleanUp(groups);
  groups = [];
});

test('the red-by-default job marks what passed its day, leaves the exclusions alone and gives no XP', async ({
  page,
}) => {
  const me = await signedUp(page);
  const yesterday = nineAm(plusDays(todayLocal(), -1));
  const mine = {
    contextId: me.contextId,
    createdBy: me.id,
    assigneeId: me.id,
    startAt: yesterday,
    visibility: 'private' as const,
  };

  const red = await oneOff(mine);
  const archived = await oneOff(mine);
  const archive = await admin
    .from('tasks')
    .update({ archived_at: new Date().toISOString() })
    .eq('id', archived.taskId);
  expect(archive.error).toBeNull();
  // Reopened a moment ago: the 60 minutes of reopenGraceMinutes are for rescheduling first
  const reopened = await oneOff(mine);
  await setStatus(me.id, reopened.occurrenceId, 'pending', 'done');
  await setStatus(me.id, reopened.occurrenceId, 'done', 'pending');

  // In a group: someone else's red, a photo waiting for review, and a person who left
  const group = await newGroup();
  groups.push(group);
  const inGroup = {
    contextId: group.plainContext,
    createdBy: group.owner.id,
    startAt: yesterday,
    visibility: 'group' as const,
  };
  const member = await newAuthor(group);
  const theirs = await oneOff({ ...inGroup, assigneeId: member.id });
  const author = await newAuthor(group, { consent: false });
  const waiting = await oneOff({ ...inGroup, assigneeId: author.id, photo: true, approval: true });
  await sendProof(waiting.occurrenceId, author.id);
  expect(await occurrence(waiting.occurrenceId)).toMatchObject({
    status: 'done',
    proof_review_status: 'in_review',
  });
  const leaver = await newAuthor(group);
  const orphan = await oneOff({ ...inGroup, assigneeId: leaver.id });
  const left = await admin
    .from('group_members')
    .delete()
    .eq('group_id', group.id)
    .eq('user_id', leaver.id);
  expect(left.error).toBeNull();

  await expect(bell(page, 0)).toBeVisible();
  const first = await admin.rpc('auto_miss_occurrences');
  expect(first.error).toBeNull();
  expect(first.data).toBeGreaterThanOrEqual(2);
  // Running again changes nothing: the filter is pending
  expect((await admin.rpc('auto_miss_occurrences')).error).toBeNull();

  expect(await occurrence(red.occurrenceId)).toMatchObject({ status: 'missed' });
  expect(await occurrence(theirs.occurrenceId)).toMatchObject({ status: 'missed' });
  expect(await occurrence(archived.occurrenceId)).toMatchObject({ status: 'pending' });
  expect(await occurrence(reopened.occurrenceId)).toMatchObject({ status: 'pending' });
  expect(await occurrence(orphan.occurrenceId)).toMatchObject({ status: 'pending' });
  expect(await occurrence(waiting.occurrenceId)).toMatchObject({
    status: 'done',
    proof_review_status: 'in_review',
  });

  // The system did it: one history line with no author, zero XP, the notice to the assignee only
  expect(await history(red.occurrenceId)).toEqual([
    { from_status: 'pending', to_status: 'missed', changed_by: null },
  ]);
  expect(await xpOf(red.occurrenceId)).toEqual([]);
  expect(await xpOf(theirs.occurrenceId)).toEqual([]);
  expect((await noticesOf(member.id, theirs.occurrenceId)).map(({ type }) => type)).toEqual([
    'occurrence_missed',
  ]);
  expect(await noticesOf(group.owner.id, theirs.occurrenceId)).toEqual([]);
  expect(await noticesOf(leaver.id, orphan.occurrenceId)).toEqual([]);

  // Live in the open app, and in the list with the text of an automatic red and until when it
  // can still be done (ADR-0008, section 10)
  await expect(bell(page, 1)).toBeVisible();
  const toast = toastOf(page);
  await expect(toast.getByText('Tarefa não feita')).toBeVisible();
  await expect(toast.getByText(/Ainda dá para concluir até /)).toBeVisible();
  await toast.getByRole('button', { name: 'Fechar aviso' }).click();
  await bell(page, 1).click();
  await expect(
    page.getByText(
      new RegExp(
        `^${red.title} passou do prazo e ficou como não feita\\. Ainda dá para concluir até `,
      ),
    ),
  ).toBeVisible();

  // The calendar shows it red on its day
  await page.goto(`/calendar?view=day&date=${plusDays(todayLocal(), -1)}`);
  const block = (title: string) => page.getByRole('button', { name: new RegExp(`^${title}, `) });
  await expect(block(red.title).locator('visible=true')).toHaveAccessibleName(/, Não feito$/);
  await expect(block(reopened.title).locator('visible=true')).toHaveAccessibleName(/, Pendente$/);
  await expect(block(archived.title)).toHaveCount(0);

  // The 72 hours of the late window still hold: done from missed is a late done, with its XP
  await page.goto(`/tasks/${red.occurrenceId}`);
  await button(page, 'Marcar como feito').click();
  await expect(page.getByText('Não feito → Feito')).toBeVisible();
  expect(await occurrence(red.occurrenceId)).toMatchObject({ status: 'done', late: true });
  expect(await xpOf(red.occurrenceId)).toEqual([{ amount: 5, reason: 'occurrence_done_late' }]);
});

// Known bug, handoff 20261102-1440-qa-testes-para-tarefas-calendario-vermelho-some-de-hoje: Hoje lists
// as overdue only what is still pending, so once the job turns it red, an occurrence still inside the
// 72 hours of the late window leaves Hoje, and the person can only find it in the calendar.
test('a task the job turned red, still inside the late window, stays on Hoje', async ({ page }) => {
  const me = await signedUp(page);
  const red = await oneOff({
    contextId: me.contextId,
    createdBy: me.id,
    assigneeId: me.id,
    startAt: nineAm(plusDays(todayLocal(), -1)),
    visibility: 'private',
  });
  expect((await admin.rpc('auto_miss_occurrences')).error).toBeNull();
  expect(await occurrence(red.occurrenceId)).toMatchObject({ status: 'missed' });

  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Hoje', exact: true })).toBeVisible();
  test.fail();
  await expect(check(page, red.title, 'Não feito').locator('visible=true')).toBeVisible({
    timeout: 5_000,
  });
});

test('a reminder that is due rings the bell once, and not for a done or archived task', async ({
  page,
}) => {
  const me = await signedUp(page);
  // Starts in 5 minutes with a lead of 10: due 5 minutes ago, inside reminderCatchUpMinutes
  const soon = new Date(Date.now() + 5 * 60_000).toISOString();
  const mine = {
    contextId: me.contextId,
    createdBy: me.id,
    assigneeId: me.id,
    startAt: soon,
    reminders: [10],
    visibility: 'private' as const,
  };
  const due = await oneOff(mine);
  const done = await oneOff(mine);
  await setStatus(me.id, done.occurrenceId, 'pending', 'done');
  const archived = await oneOff(mine);
  await admin
    .from('tasks')
    .update({ archived_at: new Date().toISOString() })
    .eq('id', archived.taskId);

  await expect(bell(page, 0)).toBeVisible();
  // The cron may have run first; the key keeps it to one either way
  expect((await admin.rpc('enqueue_due_reminders')).error).toBeNull();
  expect((await admin.rpc('enqueue_due_reminders')).error).toBeNull();

  expect((await noticesOf(me.id, due.occurrenceId)).map(({ type }) => type)).toEqual([
    'task_reminder',
  ]);
  expect(await noticesOf(me.id, done.occurrenceId)).toEqual([]);
  expect(await noticesOf(me.id, archived.occurrenceId)).toEqual([]);

  await expect(bell(page, 1)).toBeVisible();
  await expect(toastOf(page).getByText('Daqui a 10 minutos.')).toBeVisible();
  await bell(page, 1).click();
  await page.getByText(due.title, { exact: true }).locator('visible=true').first().click();
  await expect(page).toHaveURL(new RegExp(`/tasks/${due.occurrenceId}$`));
  await page.goto('/');
  await expect(bell(page, 0)).toBeVisible();
});

// QA4-2 and QA4-3, handoff 20261102-1440-qa-testes-para-notificacoes-whatsapp-aviso-ao-vivo.
test('the live notice covers neither "Voltar", the bell, "Nova tarefa" nor the tab bar, at 320, 375 and 1280 px', async ({
  page,
}) => {
  test.slow();
  const me = await signedUp(page);
  const toast = toastOf(page);
  // The live region is there, empty, before any notice, so a screen reader hears what comes in
  await expect(toast).toHaveAttribute('role', 'status');
  await expect(toast).toHaveAttribute('aria-live', 'polite');
  await expect(toast).toBeEmpty();
  const region = await toast.elementHandle();
  await expect(bell(page, 0)).toBeVisible();

  /** A reminder due now for me: the notice comes in live with its title. */
  const ring = async () => {
    const task = await oneOff({
      contextId: me.contextId,
      createdBy: me.id,
      assigneeId: me.id,
      startAt: new Date(Date.now() + 5 * 60_000).toISOString(),
      reminders: [10],
      visibility: 'private',
    });
    expect((await admin.rpc('enqueue_due_reminders')).error).toBeNull();
    await expect(toast.getByText(task.title, { exact: true })).toBeVisible();
    return task;
  };

  for (const width of [320, 375, 1280]) {
    await page.setViewportSize({ width, height: 720 });

    // On Hoje: the bell and "Nova tarefa" still take the tap, and the notice sits above the tabs
    const first = await ring();
    expect(await uncovered(page.getByRole('button', { name: /^Avisos/ }))).toBe(true);
    expect(await uncovered(button(page, 'Nova tarefa'))).toBe(true);
    const card = (await toast.boundingBox())!;
    const tabs = (await page.getByRole('tablist').boundingBox())!;
    expect(card.y + card.height).toBeLessThanOrEqual(tabs.y);

    // A tap on the notice opens its task, inside the app
    await toast.getByText(first.title, { exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/tasks/${first.occurrenceId}$`));

    // On the task: "Voltar" still takes the tap while the next notice is up, and goes back
    await ring();
    const back = button(page, 'Voltar');
    expect(await uncovered(back)).toBe(true);
    await back.click();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole('heading', { name: 'Hoje', exact: true })).toBeVisible();
  }

  // Gone after toastMs, the region empties and stays: the same node from the start
  await expect(toast).toBeEmpty();
  expect(await toast.evaluate((element, first) => element === first, region)).toBe(true);
});
