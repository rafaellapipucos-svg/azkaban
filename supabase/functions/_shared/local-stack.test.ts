// The tests of the functions find their stack in supabase/config.toml, so a checkout on the second
// stack (pilha-b.sh) never reaches the first one. No stack needed.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { apiUrl, dbContainer, project, stackFrom } from './local-stack.mjs';

const real = readFileSync(new URL('../../config.toml', import.meta.url), 'utf8');
// The committed file, also when this checkout runs on the second stack: `ligar` undone.
const committed = real
  .replace(/^project_id = "azkaban-b"$/m, 'project_id = "azkaban"')
  .replace(/^(port|shadow_port) = 545(\d{2})$/gm, '$1 = 544$2');

test('the committed config is the first stack', () => {
  assert.deepEqual(stackFrom(committed, {}), {
    apiUrl: 'http://127.0.0.1:54421',
    project: 'azkaban',
    dbContainer: 'supabase_db_azkaban',
  });
});

test('a config switched the way pilha-b.sh does it is the second stack', () => {
  // The same substitutions as `ligar` in docs/agentes/ferramentas/pilha-b.sh, on the real file.
  const b = committed
    .replace(/^project_id = "azkaban"$/m, 'project_id = "azkaban-b"')
    .replace(/^(port|shadow_port) = 544(\d{2})$/gm, '$1 = 545$2');
  assert.notEqual(b, committed);
  assert.deepEqual(stackFrom(b, {}), {
    apiUrl: 'http://127.0.0.1:54521',
    project: 'azkaban-b',
    dbContainer: 'supabase_db_azkaban-b',
  });
});

test('only the port of [api] counts, and CRLF line ends are fine', () => {
  const toml =
    'project_id = "x"\r\n[db]\r\nport = 1\r\n[api.tls]\r\nport = 2\r\n[api]\r\nport = 3\r\n';
  assert.equal(stackFrom(toml, {}).apiUrl, 'http://127.0.0.1:3');
});

test('the environment wins over the config', () => {
  assert.deepEqual(
    stackFrom(real, { SUPABASE_URL: 'http://127.0.0.1:1', COMPOSE_PROJECT: 'other' }),
    { apiUrl: 'http://127.0.0.1:1', project: 'other', dbContainer: 'supabase_db_other' },
  );
  assert.equal(stackFrom(real, { DB_CONTAINER: 'db' }).dbContainer, 'db');
});

test('a config without the keys is refused, not guessed', () => {
  assert.throws(() => stackFrom('[api]\nport = 1\n', {}), /project_id/);
  assert.throws(() => stackFrom('project_id = "x"\n[db]\nport = 1\n', {}), /\[api\]/);
});

test('the exports follow this checkout', () => {
  assert.deepEqual({ apiUrl, project, dbContainer }, stackFrom(real, process.env));
});
