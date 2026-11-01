import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 90_000,
  // Saving a repeating task waits for the Edge Function, which takes 4s or more on a cold start with
  // four workers; the default 5s made the suite flaky (see the qa-phase-2 handoff).
  expect: { timeout: 15_000 },
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
