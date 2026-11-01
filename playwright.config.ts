import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 90_000,
  // Saving no longer waits for the Edge Function, but a repeating task's days still appear only when
  // it finishes: 4s on a cold start, and 10s or more with four workers sharing one local function
  // runtime. The default 5s, and 10s, failed one or two tests in every full run.
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
