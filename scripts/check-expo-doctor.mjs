// Runs expo-doctor on apps/app (BL-21) without an Expo account. Fails on any failed check, except the
// duplicate native modules listed below: removing them changes dependencies, which is BL-17/BL-20 work
// (LOG 2026-11-03, ci/expo-config-doctor). A new duplicate, or any other failed check, fails CI.
import { spawnSync } from 'node:child_process';

// Pinned: a new doctor can add checks; bump it on purpose, with the LOG.
const doctor = 'expo-doctor@1.21.5';
const duplicatesCheck = 'Check that no duplicate dependencies are installed';
// Each name leaves this list in the commit that de-duplicates it.
const knownDuplicates = [
  '@react-native-async-storage/async-storage',
  'react-native-safe-area-context',
];

// ponytail: shell so `npx` resolves on Windows too; the command is fixed, no input goes into it.
// cwd, not a path argument: the Metro check loads `tailwind.config` relative to the working directory.
const run = spawnSync(`npx -y ${doctor}`, {
  cwd: 'apps/app',
  shell: true,
  encoding: 'utf8',
  env: { ...process.env, EXPO_NO_TELEMETRY: '1' },
});
const output = `${run.stdout ?? ''}${run.stderr ?? ''}`;
console.log(output);
if (run.status === 0) process.exit(0);

const failed = new Set(output.match(/^✖ .+$/gm)?.map((line) => line.slice(2).trim()) ?? []);
const duplicates = [...output.matchAll(/Found duplicates for (\S+):/g)].map((match) => match[1]);
const unknownChecks = [...failed].filter((check) => check !== duplicatesCheck);
const unknownDuplicates = duplicates.filter((name) => !knownDuplicates.includes(name));

if (failed.size === 0 || unknownChecks.length > 0 || unknownDuplicates.length > 0) {
  console.error('expo-doctor failed beyond the known duplicates:', {
    unknownChecks,
    unknownDuplicates,
  });
  process.exit(1);
}
const gone = knownDuplicates.filter((name) => !duplicates.includes(name));
if (gone.length > 0) console.log(`No longer duplicated, remove from the list: ${gone.join(', ')}`);
console.log(`Only the known duplicates failed (${duplicates.join(', ')}): BL-17/BL-20.`);
