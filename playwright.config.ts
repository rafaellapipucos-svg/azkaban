import { defineConfig, devices } from '@playwright/test';

// `supabase start` already serves the functions. Leave `supabase functions serve` off during a run: on
// Windows its watcher takes the hourly update of a file's last access for a write, even from a plain
// read, and restarts the runtime in the middle of the suite (503 and 502).
//
// Not 8081: that is `pnpm dev`, and on this machine it can be another project's Expo. Auth accepts this
// port in supabase/config.toml.
const baseURL = 'http://localhost:8091';

export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/global-setup.ts',
  // `notifications-jobs` calls the reminder and red jobs, which act on every row of the database, as
  // a cron tick does: it runs after the rest, so it touches no other spec's task. A failure in `app`
  // skips it (`--no-deps` runs it alone).
  projects: [
    { name: 'app', testIgnore: /notifications-jobs\.spec\.ts/ },
    { name: 'jobs', testMatch: /notifications-jobs\.spec\.ts/, dependencies: ['app'] },
  ],
  timeout: 90_000,
  // The local runtime kills a worker past 2 s of CPU, with a 546. At the default of half the cores
  // (8 here) that hit the first `proof-validate` of 3 runs in 6; at 4, of none in 8.
  workers: process.env.CI ? undefined : 4,
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
