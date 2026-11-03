import { defineConfig, devices } from '@playwright/test';
import { existsSync, readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';

// `supabase start` already serves the functions. Leave `supabase functions serve` off during a run: on
// Windows its watcher takes the hourly update of a file's last access for a write, even from a plain
// read, and restarts the runtime in the middle of the suite (503 and 502).
//
// Not 8081: that is `pnpm dev`, and on this machine it can be another project's Expo. Auth accepts this
// port in supabase/config.toml.
const baseURL = 'http://localhost:8091';

// `E2E_BUILD=1`: the production build (`pnpm build:web`) served static by `e2e/serve-build.mjs`, where the goals
// 2 to 4 of ADR-0012, section 10, count. `build:web` would read `.env.local`, which may point at the hosted
// project: `EXPO_NO_DOTENV` turns Expo's `.env` loading off, and the build gets only the `EXPO_PUBLIC_*`
// values of the shell, or else of `.env.development.local`. A Supabase URL that is not the local stack,
// or none (a worktree has no `.env.development.local`), stops the run before it builds.
const build = process.env.E2E_BUILD === '1';
const localEnv = 'apps/app/.env.development.local';
const buildEnv: Record<string, string> = {};
if (build) {
  const file = existsSync(localEnv) ? parseEnv(readFileSync(localEnv, 'utf8')) : {};
  for (const [key, value] of Object.entries({ ...file, ...process.env })) {
    if (key.startsWith('EXPO_PUBLIC_') && value !== undefined) buildEnv[key] = value;
  }
  const url = buildEnv.EXPO_PUBLIC_SUPABASE_URL;
  const host = url && URL.canParse(url) ? new URL(url).hostname : undefined;
  if (host !== '127.0.0.1' && host !== 'localhost') {
    throw new Error(
      `E2E_BUILD=1 needs EXPO_PUBLIC_SUPABASE_URL of the local stack, in the shell or in ${localEnv} ` +
        `(see apps/app/.env.example); got ${url ?? 'none'}`,
    );
  }
  buildEnv.EXPO_NO_DOTENV = '1';
}

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
    // Every context starts as a device that already saw the push step after signing in (ADR-0012,
    // section 13, item 2), so it does not stand in front of Hoje; `push-setup.spec.ts` clears it.
    storageState: {
      cookies: [],
      origins: [
        { origin: baseURL, localStorage: [{ name: 'notifications.pushOffered', value: '1' }] },
      ],
    },
    ...devices['Pixel 7'],
  },
  webServer: {
    command: build ? 'pnpm build:web && node e2e/serve-build.mjs 8091' : 'pnpm dev --port 8091',
    env: { ...(buildEnv as Record<string, string>), ...(process.env as Record<string, string>) },
    url: baseURL,
    // Anything already on the port fails the run: it may be another worktree's or project's server.
    reuseExistingServer: false,
    timeout: build ? 300_000 : 120_000,
  },
});
