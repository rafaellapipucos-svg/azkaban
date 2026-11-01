import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 90_000,
  // The default 5s is not enough with four workers on one dev server and one local database: a
  // repeating task's days now appear when the Edge Function finishes (4s or more on a cold start).
  expect: { timeout: 10_000 },
  use: {
    baseURL: 'http://localhost:8081',
    trace: 'retain-on-failure',
    ...devices['Pixel 7'],
  },
  webServer: {
    command: 'pnpm dev',
    url: 'http://localhost:8081',
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
