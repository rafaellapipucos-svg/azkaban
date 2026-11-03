// Every runtime import of every function resolves through its deno.json, without Deno and without the
// stack. An extensionless import of packages/* that the map misses makes the function fail to boot
// (503 on the preflight, `Module not found` in `docker logs supabase_edge_runtime_<project_id>`), and only
// a stack with the function served would show it. Type-only imports are erased, so they are skipped.
//
// The same runtime graph backs the guarantee of ADR-0012, section 18: no function answers 503, so a 503
// of `/functions/v1/` means the function never ran and the client may send it again (BL-10).
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const functionsDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
// ponytail: a regex, not a parser. Static imports and re-exports at the start of a line, which is
// how this repository writes them; a dynamic import() is not followed.
const importPattern = /^\s*(?:import|export)\s+(type\s+)?(?:[^'";]*?\s+from\s+)?['"]([^'"]+)['"]/gm;
const external = /^(npm|node|jsr|https?):/;

/** What the runtime graph of a function misses, and the files it reaches. */
function graph(slug: string): { missing: string[]; files: string[] } {
  const dir = join(functionsDir, slug);
  const map: Record<string, string> =
    JSON.parse(readFileSync(join(dir, 'deno.json'), 'utf8')).imports ?? {};
  const target = (value: string) => (external.test(value) ? null : resolve(dir, value));
  const relativeKeys = new Map(
    Object.entries(map)
      .filter(([key]) => key.startsWith('.'))
      .map(([key, value]) => [resolve(dir, key), value]),
  );
  const missing: string[] = [];
  const seen = new Set<string>();
  const visit = (file: string) => {
    if (seen.has(file)) return;
    seen.add(file);
    for (const [, typeOnly, specifier] of readFileSync(file, 'utf8').matchAll(importPattern)) {
      if (typeOnly || external.test(specifier!)) continue;
      let path: string | null;
      if (specifier!.startsWith('.')) {
        const absolute = resolve(dirname(file), specifier!);
        const mapped = relativeKeys.get(absolute);
        path = mapped === undefined ? absolute : target(mapped);
      } else if (specifier! in map) {
        path = target(map[specifier!]!);
      } else {
        missing.push(`${file}: ${specifier} is not in the import map`);
        continue;
      }
      if (path === null) continue;
      if (!existsSync(path) || !/\.(ts|json)$/.test(path)) {
        missing.push(`${file}: ${specifier} does not resolve to a file`);
      } else if (path.endsWith('.ts')) {
        visit(path);
      }
    }
  };
  visit(join(dir, 'index.ts'));
  return { missing, files: [...seen] };
}

// ponytail: two regexes over the function's own files (packages/* build no responses). The literal
// anywhere, comments included; and an upstream `.status` handed to a response, as the code writes
// them (`reply(x.status`, `status: x.status`). A status relayed through a variable is not followed.
const literal503 = /\b503\b/;
const relayedStatus = /(?:\b(?:reply|json|empty|refuse)\([^)]*|\bstatus:\s*)\b\w+\.status\b/;

const served = readdirSync(functionsDir, { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && !entry.name.startsWith('_'))
  .map((entry) => entry.name)
  .filter((slug) => existsSync(join(functionsDir, slug, 'index.ts')));

test('there are functions to check', () => {
  assert.ok(served.length >= 5, served.join(', '));
});

for (const slug of served) {
  test(`${slug}: every runtime import resolves through deno.json`, () => {
    assert.ok(existsSync(join(functionsDir, slug, 'deno.json')), 'deno.json is missing');
    assert.deepEqual(graph(slug).missing, []);
  });

  test(`${slug}: never answers 503, nor relays the status of a service outside`, () => {
    const offending = graph(slug)
      .files.filter((file) => file.startsWith(functionsDir))
      .flatMap((file) => {
        const text = readFileSync(file, 'utf8');
        return [
          ...(literal503.test(text) ? [`${file}: the literal 503`] : []),
          ...(relayedStatus.test(text) ? [`${file}: relays an upstream status`] : []),
        ];
      });
    assert.deepEqual(offending, []);
  });
}

test('the 503 guard catches what it guards', () => {
  assert.ok(literal503.test("return reply(503, { error: 'unavailable' });"));
  assert.ok(!literal503.test('return reply(500, { error: 5030 });'));
  assert.ok(relayedStatus.test('return reply(response.status, body);'));
  assert.ok(relayedStatus.test("refuse('x', upstream.status, code)"));
  assert.ok(relayedStatus.test('new Response(null, { status: res.status })'));
  assert.ok(!relayedStatus.test('return classify(response.status, wait);'));
  assert.ok(!relayedStatus.test('return reply(status, body);'));
});
