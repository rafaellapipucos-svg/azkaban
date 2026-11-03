// Runs expo-doctor on apps/app (BL-21) without an Expo account. Any failed check, a duplicate native
// module included, fails CI (BL-21b de-duplicated the last ones, LOG 2026-11-03).
import { spawnSync } from 'node:child_process';

// Pinned: a new doctor can add checks; bump it on purpose, with the LOG.
const doctor = 'expo-doctor@1.21.5';

// ponytail: shell so `npx` resolves on Windows too; the command is fixed, no input goes into it.
// cwd, not a path argument: the Metro check loads `tailwind.config` relative to the working directory.
const run = spawnSync(`npx -y ${doctor}`, {
  cwd: 'apps/app',
  shell: true,
  stdio: 'inherit',
  env: { ...process.env, EXPO_NO_TELEMETRY: '1' },
});
process.exit(run.status ?? 1);
