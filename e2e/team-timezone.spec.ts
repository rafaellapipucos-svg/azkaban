import { randomUUID } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';

// Needs `pnpm db:start`. The team view counts days in the zone of the profile (ADR-0006), not in
// the one of the device, so the device is put on the other side of the world.
test.use({ timezoneId: 'Pacific/Auckland' });

const button = (page: Page, name: string) =>
  page.getByRole('button', { name, exact: true }).locator('visible=true');

test('the team view asks for the days in the profile zone, not the device zone', async ({
  page,
}) => {
  const bodies: unknown[] = [];
  page.on('request', (request) => {
    if (request.url().includes('/rpc/team_overview')) bodies.push(request.postDataJSON());
  });

  await page.goto('/sign-up');
  await page.getByLabel('Seu nome').fill('Fuso');
  await page.getByLabel('E-mail', { exact: true }).fill(`fuso-${randomUUID()}@example.com`);
  await page.getByLabel('Senha').fill(randomUUID());
  await button(page, 'Criar conta').first().click();
  await expect(page.getByRole('heading', { name: 'Hoje', exact: true })).toBeVisible();
  await page.goto('/groups/new');
  await page.getByLabel('Nome do grupo').fill('Equipe Fuso');
  await button(page, 'Criar grupo').click();
  await button(page, 'Ver equipe').click();
  await expect(page.getByRole('heading', { name: 'Equipe' })).toBeVisible();

  await expect.poll(() => bodies.length).toBeGreaterThan(0);
  // The profile was created with the default zone of the app, Sao Paulo
  expect(
    bodies.every((body) => (body as { p_timezone: string }).p_timezone === 'America/Sao_Paulo'),
  ).toBe(true);
});
