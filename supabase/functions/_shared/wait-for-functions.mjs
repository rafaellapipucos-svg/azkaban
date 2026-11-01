// Runs before the integration tests of the functions (`pnpm functions:test`). The local Edge Runtime
// recycles idle workers, and a request that lands on one that is going away gets a 502. Calling the
// preflight of each function until it answers boots a fresh worker, so the first real request of a
// test does not pay for it. Mirrors the wait loop of the CI workflow, for every function.
const api = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54421';
const names = ['materialize-occurrences', 'proof-validate', 'proof-url', 'proof-retention'];

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
    console.error(
      `${name} does not answer (last status ${status}). Is "supabase functions serve" running?`,
    );
    process.exit(1);
  }
}
