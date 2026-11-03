// `deno check` of every served function, each with its own deno.json, by the Deno of the root devDependency
// (the version the Edge Runtime of the local stack runs). Only the runtime graph from index.ts: the tests
// run on Node, and the ones the e2e imports go through `pnpm typecheck:e2e`. `--no-lock`: no deno.lock
// is written next to the functions; the npm versions are pinned in each deno.json.
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const functionsDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const deno = createRequire(import.meta.url).resolve('deno/bin.cjs');

const served = readdirSync(functionsDir, { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && !entry.name.startsWith('_'))
  .map((entry) => entry.name)
  .filter((slug) => existsSync(join(functionsDir, slug, 'index.ts')));

let failed = 0;
for (const slug of served) {
  const dir = join(functionsDir, slug);
  const { status } = spawnSync(
    process.execPath,
    [
      deno,
      'check',
      '--quiet',
      '--no-lock',
      '--config',
      join(dir, 'deno.json'),
      join(dir, 'index.ts'),
    ],
    { stdio: 'inherit' },
  );
  if (status !== 0) {
    console.error(`deno check failed: ${slug}`);
    failed += 1;
  }
}
if (failed > 0) process.exit(1);
console.log(`deno check: ${served.length} functions`);
