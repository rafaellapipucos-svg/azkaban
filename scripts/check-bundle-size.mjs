// Fails when the largest JS of `pnpm build:web`, gzipped, passes 110% of the size measured when F8-6
// started (ADR-0012, section 10). Run after `pnpm build:web`; CI does, right after the build.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';

// `__common-<hash>.js` on 2026-11-03, zlib default level (handoff 20261103-0633-design-system).
// A deliberate growth moves this number, in the same commit, with the reason in the LOG.
const baselineBytes = 388_765;
const ceilingBytes = Math.floor(baselineBytes * 1.1);
const dist = 'apps/app/dist';

const files = readdirSync(dist, { recursive: true }).filter((file) => file.endsWith('.js'));
if (files.length === 0) throw new Error(`No JS in ${dist}: run pnpm build:web first`);

const [largest] = files
  .map((file) => ({ file, bytes: gzipSync(readFileSync(join(dist, file))).length }))
  .sort((a, b) => b.bytes - a.bytes);

console.log(
  `Largest JS, gzipped: ${largest.bytes} bytes (${largest.file}); ceiling ${ceilingBytes}`,
);
if (largest.bytes > ceilingBytes) {
  console.error('Web bundle over the ceiling (ADR-0012, section 10).');
  process.exit(1);
}
