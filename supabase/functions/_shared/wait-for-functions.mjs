// Runs before the integration tests of the functions (`pnpm functions:test`). The local Edge Runtime
// recycles idle workers, and a request that lands on one that is going away gets a 502. Calling the
// preflight of each function until it answers boots a fresh worker, so the first real request of a
// test does not pay for it.
import { apiUrl as api, project } from './local-stack.mjs';

const names = [
  'materialize-occurrences',
  'proof-validate',
  'proof-url',
  'proof-retention',
  'dispatch-notifications',
  'phone-verification',
  'whatsapp-webhook',
];

for (const name of names) {
  let status = 0;
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      status = (await fetch(`${api}/functions/v1/${name}`, { method: 'OPTIONS' })).status;
    } catch {
      status = 0;
    }
    if (status >= 200 && status < 300) break;
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  if (status < 200 || status >= 300) {
    // A 503 usually means the worker failed to boot, e.g. a relative import of `packages/*` missing
    // from the function's `deno.json` (the CLI mounts only mapped files, at `db:start`).
    console.error(
      `${name} does not answer (last status ${status}). Did "pnpm db:start" finish? ` +
        `On 503, see "docker logs supabase_edge_runtime_${project}" for a worker boot error.`,
    );
    process.exit(1);
  }
}
