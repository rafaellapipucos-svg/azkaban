// Runs expo-doctor on apps/app (BL-21) without an Expo account. Any failed check, a duplicate native
// module included, fails CI (BL-21b de-duplicated the last ones, LOG 2026-11-03).
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

// The root devDependency, pinned and in the lockfile (BL23-5): a new doctor can add checks; bump it on
// purpose, with the LOG. `exports` hides the bin, so it is read from the package.json.
const pkgPath = createRequire(import.meta.url).resolve('expo-doctor/package.json');
const pkg = createRequire(import.meta.url)(pkgPath);
const doctor = join(dirname(pkgPath), pkg.bin['expo-doctor']);

// cwd, not a path argument: the Metro check loads `tailwind.config` relative to the working directory.
// EXPO_OFFLINE: the version check (`expo install --check`, spawned by the doctor with our env) compares
// with `node_modules/expo/bundledNativeModules.json` of the installed SDK, pinned by the lockfile, not with
// the table the Expo API publishes today. Same commit, same result; a new Expo patch is a deliberate bump
// (`npx expo install --fix` in apps/app, same versions in packages/*), not a red CI. Duplicates and
// versions outside the installed SDK still fail.
const run = spawnSync(process.execPath, [doctor], {
  cwd: 'apps/app',
  stdio: 'inherit',
  env: { ...process.env, EXPO_NO_TELEMETRY: '1', EXPO_OFFLINE: '1' },
});
process.exit(run.status ?? 1);
