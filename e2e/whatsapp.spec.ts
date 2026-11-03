import { randomInt, randomUUID } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';
import { admin, CRON_SECRET, functionUrl } from '../supabase/functions/_shared/proof-kit';
import { button, newUser, signUp } from './proof-fixtures';

// Needs `pnpm db:start` with `phone-verification` and the WhatsApp channel of `dispatch-notifications`
// served, and WHATSAPP_PROVIDER empty or `console` (ADR-0009). Nothing leaves the machine: the code and
// the summary are read in `whatsapp_console_messages`, which only the service role sees.
// Written by notificacoes-whatsapp without a stack to run it on; the phase QA runs and adjusts it.

type Outbound = { kind: string; template?: string; code?: string; params?: Record<string, string> };

/** The newest message of the console outbox to `phone` that matches. */
async function lastMessage(phone: string, match: (message: Outbound) => boolean) {
  let found: Outbound | undefined;
  await expect
    .poll(
      async () => {
        const { data } = await admin
          .from('whatsapp_console_messages')
          .select('message')
          .eq('to_e164', phone)
          .order('created_at', { ascending: false });
        found = (data ?? []).map((row) => row.message as Outbound).find(match);
        return Boolean(found);
      },
      { timeout: 20_000 },
    )
    .toBe(true);
  return found!;
}

/** Signed up through the screens, with a personal context. */
async function signedUp(page: Page) {
  const user = newUser(`Zap${randomUUID().slice(0, 6)}`);
  await signUp(page, user);
  await button(page, 'Novo contexto').click();
  await page.getByLabel('Nome', { exact: true }).fill('Casa');
  await button(page, 'Salvar').click();
  await expect(page.getByRole('heading', { name: 'Hoje', exact: true })).toBeVisible();
  const profile = await admin
    .from('profiles')
    .select('id, timezone')
    .eq('display_name', user.name)
    .single();
  const id = profile.data!.id as string;
  const context = await admin.from('contexts').select('id').eq('created_by', id).single();
  return {
    id,
    timezone: profile.data!.timezone as string,
    contextId: context.data!.id as string,
  };
}

test('verify the number by the code, opt in, get the daily summary, turn off and remove', async ({
  page,
}) => {
  const me = await signedUp(page);
  // A number of its own, so the per-number limit of other runs never applies
  const national = `119${String(randomInt(10_000_000, 99_999_999))}`;
  const phone = `+55${national}`;

  await page.goto('/settings/notifications');
  await expect(page).toHaveTitle(/^Notificações · /);
  await expect(page.getByLabel('Código do país')).toHaveValue('55');

  // Something the normalizer refuses never reaches the function
  await page.getByLabel('Número com DDD').fill('12');
  await button(page, 'Enviar código').click();
  await expect(page.getByText('Confira o número, com DDD.')).toBeVisible();

  await page
    .getByLabel('Número com DDD')
    .fill(`(${national.slice(0, 2)}) ${national.slice(2, 7)}-${national.slice(7)}`);
  await button(page, 'Enviar código').click();
  await expect(page.getByText(`Enviamos um código pelo WhatsApp para ${phone}.`)).toBeVisible();
  // `resendSeconds`: another code only after the countdown
  await expect(page.getByText(/^Você pode pedir outro código em \d+ segundos?\.$/)).toBeVisible();
  await expect(button(page, 'Pedir outro código')).toBeDisabled();

  const { code } = await lastMessage(phone, (message) => message.kind === 'code');
  expect(code).toMatch(/^\d{6}$/);

  const wrong = code === '000000' ? '111111' : '000000';
  await page.getByLabel('Código de 6 dígitos').fill(wrong);
  await button(page, 'Confirmar').click();
  await expect(page.getByText('Código errado. Confira e tente de novo.')).toBeVisible();

  await page.getByLabel('Código de 6 dígitos').fill(code!);
  await button(page, 'Confirmar').click();

  // The notice of consent version 1, with the number, then the opt-in
  await expect(
    page.getByText(`As mensagens vêm do Azkaban, para o número ${phone}.`),
  ).toBeVisible();
  await button(page, 'Ativar o WhatsApp').click();
  await expect(page.getByText(`Ativo para ${phone}.`)).toBeVisible();
  const ready = await admin
    .from('profiles')
    .select('phone_e164, phone_verified_at, whatsapp_opt_in_at, whatsapp_opt_in_version')
    .eq('id', me.id)
    .single();
  expect(ready.data).toMatchObject({ phone_e164: phone, whatsapp_opt_in_version: 1 });
  expect(ready.data!.phone_verified_at).not.toBeNull();
  expect(ready.data!.whatsapp_opt_in_at).not.toBeNull();

  // The summary at the current minute of the profile's zone, so the job takes it now
  const now = new Intl.DateTimeFormat('en-GB', {
    timeZone: me.timezone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(new Date());
  await page.getByLabel('Horário', { exact: true }).fill(now);
  await button(page, 'Salvar resumo').click();
  await expect(page.getByText('Resumo salvo.')).toBeVisible();
  const prefs = await admin
    .from('profiles')
    .select('daily_summary_enabled, daily_summary_time')
    .eq('id', me.id)
    .single();
  expect(prefs.data).toMatchObject({
    daily_summary_enabled: true,
    daily_summary_time: `${now}:00`,
  });

  // A task for today, so the default "skip an empty day" does not hold the summary back
  const title = `Zap ${randomUUID().slice(0, 8)}`;
  const task = await admin.from('tasks').insert({
    context_id: me.contextId,
    created_by: me.id,
    assignee_id: me.id,
    title,
    schedule_type: 'timed',
    // ponytail: one minute ahead stays today except at 23:59 in the profile's zone
    start_at: new Date(Date.now() + 60_000).toISOString(),
    duration_min: 30,
    timezone: me.timezone,
    rrule: null,
    reminders: [],
    requires_photo_proof: false,
    requires_admin_approval: false,
    requires_partial_reason: false,
    difficulty: 'easy',
    priority: 'normal',
    visibility: 'private',
  });
  expect(task.error).toBeNull();

  // The job and the dispatch, as their crons would run them
  const enqueued = await admin.rpc('enqueue_daily_summaries');
  expect(enqueued.error).toBeNull();
  const dispatch = await fetch(functionUrl('dispatch-notifications'), {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-cron-secret': CRON_SECRET },
    body: '{}',
  });
  expect(dispatch.status).toBe(200);

  const summary = await lastMessage(
    phone,
    (message) => message.kind === 'template' && message.template === 'daily_summary_v1',
  );
  expect(summary.params?.today).toContain(title);

  // The bell lists it, born read
  const row = await admin
    .from('notifications')
    .select('read_at, created_at')
    .eq('user_id', me.id)
    .eq('type', 'daily_summary')
    .single();
  expect(row.data!.read_at).toBe(row.data!.created_at);

  // Off, then the number removed
  await button(page, 'Parar de receber pelo WhatsApp').click();
  await expect(page.getByText('Desligado.')).toBeVisible();
  await button(page, 'Remover o número').click();
  await button(page, 'Confirmar: apaga o número e desliga o WhatsApp').click();
  await expect(page.getByLabel('Número com DDD')).toBeVisible();
  const removed = await admin
    .from('profiles')
    .select('phone_e164, phone_verified_at, whatsapp_opt_in_at')
    .eq('id', me.id)
    .single();
  expect(removed.data).toEqual({
    phone_e164: null,
    phone_verified_at: null,
    whatsapp_opt_in_at: null,
  });
});
