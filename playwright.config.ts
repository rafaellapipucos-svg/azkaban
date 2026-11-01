import { defineConfig, devices } from '@playwright/test';

// Not 8081: that is `pnpm dev`, and on this machine it can be another project's Expo. Auth accepts this
// port in supabase/config.toml.
const baseURL = 'http://localhost:8091';

export default defineConfig({
  testDir: './e2e',
  timeout: 90_000,
  // Saving no longer waits for the Edge Function, but a repeating task's days still appear only when
  // it finishes: 4s on a cold start, and 10s or more with four workers sharing one local function
  // runtime. The default 5s, and 10s, failed one or two tests in every full run.
  expect: { timeout: 15_000 },
  use: {
    baseURL,
    trace: 'retain-on-failure',
    ...devices['Pixel 7'],
  },
  webServer: {
    command: 'pnpm dev --port 8091',
    url: baseURL,
    // Anything already on the port fails the run: it may be another worktree's or project's server.
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
