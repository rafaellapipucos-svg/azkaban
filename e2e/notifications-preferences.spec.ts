import { randomBytes, randomUUID } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';
import { admin } from '../supabase/functions/_shared/proof-kit';
import { button, clientOf, newUser, signUp } from './proof-fixtures';

// Needs `pnpm db:start`. Push itself is not exercised: Playwright receives no Web Push. The devices
// part needs EXPO_PUBLIC_VAPID_PUBLIC_KEY in the environment of `pnpm e2e` (any valid public key):
// without it the app hides push, which the last test checks.
const vapid = Boolean(process.env.EXPO_PUBLIC_VAPID_PUBLIC_KEY);

async function signedUp(page: Page) {
  const user = newUser(`Ana${randomUUID().slice(0, 6)}`);
  await signUp(page, user);
  await button(page, 'Novo contexto').click();
  await page.getByLabel('Nome', { exact: true }).fill('Casa');
  await button(page, 'Salvar').click();
  await expect(page.getByRole('heading', { name: 'Hoje', exact: true })).toBeVisible();
  const { data } = await admin.from('profiles').select('id').eq('display_name', user.name).single();
  return data!.id as string;
}

async function openPreferences(page: Page) {
  await page
    .getByRole('tab', { name: 'Perfil' })
    .or(page.getByRole('link', { name: 'Perfil' }))
    .first()
    .click();
  await button(page, 'Notificações').click();
  await expect(page.getByRole('heading', { name: 'Notificações', exact: true })).toBeVisible();
}

const noQuiet = (page: Page) => page.getByRole('switch', { name: 'Sem horário de silêncio' });

test('quiet hours start at 22:00 to 07:00, change, turn off and come back after a reload', async ({
  page,
}) => {
  const userId = await signedUp(page);
  await openPreferences(page);
  await expect(page).toHaveTitle(/^Notificações · /);
  await expect(page.getByText('No fuso do seu perfil (America/Sao_Paulo).')).toBeVisible();
  await expect(page.getByLabel('Começa às')).toHaveValue('22:00');
  await expect(page.getByLabel('Termina às')).toHaveValue('07:00');

  // The same time at both ends is refused before it reaches the database
  await page.getByLabel('Começa às').fill('07:00');
  await button(page, 'Salvar horário').click();
  await expect(page.getByText('O começo e o fim precisam ser diferentes.')).toBeVisible();

  await page.getByLabel('Começa às').fill('23:30');
  await button(page, 'Salvar horário').click();
  await expect(page.getByText('Horário salvo.')).toBeVisible();
  await page.reload();
  await expect(page.getByLabel('Começa às')).toHaveValue('23:30');
  const saved = await admin
    .from('profiles')
    .select('quiet_hours_start, quiet_hours_end')
    .eq('id', userId)
    .single();
  expect(saved.data).toEqual({ quiet_hours_start: '23:30:00', quiet_hours_end: '07:00:00' });

  await noQuiet(page).click();
  await expect(noQuiet(page)).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByLabel('Começa às')).toHaveCount(0);
  await page.reload();
  await expect(noQuiet(page)).toHaveAttribute('aria-checked', 'true');

  await noQuiet(page).click();
  await expect(page.getByLabel('Começa às')).toHaveValue('22:00');
});

test('push switches follow the defaults, save per type and come back', async ({ page }) => {
  test.skip(!vapid, 'needs EXPO_PUBLIC_VAPID_PUBLIC_KEY');
  await signedUp(page);
  await openPreferences(page);
  const reminder = page.getByRole('switch', { name: 'Lembretes das suas tarefas' });
  const missed = page.getByRole('switch', { name: 'Tarefa sua que ficou como não feita' });
  await expect(reminder).toHaveAttribute('aria-checked', 'true');
  await expect(missed).toHaveAttribute('aria-checked', 'false');
  await reminder.click();
  await missed.click();
  await page.reload();
  await expect(reminder).toHaveAttribute('aria-checked', 'false');
  await expect(missed).toHaveAttribute('aria-checked', 'true');
  // Playwright's browser has PushManager, so the card offers to turn it on
  await expect(page.getByText('Receber avisos no aparelho')).toBeVisible();
});

test('a device that receives is listed by name and can be removed', async ({ page }) => {
  test.skip(!vapid, 'needs EXPO_PUBLIC_VAPID_PUBLIC_KEY');
  const userId = await signedUp(page);
  // What the app sends after the browser subscribes. The keys are only checked for their length.
  const registered = await clientOf(userId).rpc('register_push_subscription', {
    p_endpoint: `https://fcm.googleapis.com/fcm/send/${randomUUID()}`,
    p_p256dh: randomBytes(65).toString('base64url'),
    p_auth: randomBytes(16).toString('base64url'),
    p_user_agent:
      'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36',
  });
  expect(registered.error).toBeNull();

  await openPreferences(page);
  await expect(page.getByText('Chrome · Android', { exact: true })).toBeVisible();
  await button(page, 'Parar de receber neste aparelho').click();
  await expect(page.getByText('Nenhum aparelho recebe notificações ainda.')).toBeVisible();
  const { count } = await admin
    .from('push_subscriptions')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId);
  expect(count).toBe(0);
});

test('without a public key, push is hidden and the bell and quiet hours remain', async ({
  page,
}) => {
  test.skip(vapid, 'only without EXPO_PUBLIC_VAPID_PUBLIC_KEY');
  await signedUp(page);
  await openPreferences(page);
  await expect(page.getByText('Horário de silêncio', { exact: true })).toBeVisible();
  await expect(page.getByText('Receber avisos no aparelho')).toHaveCount(0);
  await expect(page.getByText('Aparelhos que recebem')).toHaveCount(0);
  await expect(page.getByRole('switch', { name: 'Lembretes das suas tarefas' })).toHaveCount(0);
});
