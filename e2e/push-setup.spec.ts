import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { button, newUser, signUp } from './proof-fixtures';

// Needs `pnpm db:start` and EXPO_PUBLIC_VAPID_PUBLIC_KEY in the environment of `pnpm e2e`: without a
// key the app hides push, and the step never shows. A fresh device, without the seed of the config.
test.use({ storageState: { cookies: [], origins: [] } });

test('the push step shows once after the first sign-in, and "Agora não" goes to Hoje', async ({
  page,
}) => {
  test.skip(!process.env.EXPO_PUBLIC_VAPID_PUBLIC_KEY, 'push is hidden without a VAPID key');
  await signUp(page, newUser(`Ana${randomUUID().slice(0, 6)}`));
  await expect(page).toHaveURL(/\/push-setup$/);
  await expect(
    page.getByRole('heading', { name: 'Receber avisos no aparelho', exact: true }),
  ).toBeVisible();
  await expect(button(page, 'Ativar notificações')).toBeVisible();

  await button(page, 'Agora não').click();
  await expect(page.getByRole('heading', { name: 'Hoje', exact: true })).toBeVisible();

  // Offered once per device: a reload, and the next visit to Hoje, stay on Hoje.
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Hoje', exact: true })).toBeVisible();
  await expect(page).not.toHaveURL(/\/push-setup$/);
});
