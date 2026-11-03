// The local stack that the tests of the functions talk to, read from the supabase/config.toml of this
// checkout: the `project_id` names the Docker containers and the `port` of `[api]` is the gateway. A
// checkout switched to the second stack (docs/agentes/ferramentas/pilha-b.sh) therefore reaches only
// that stack, with nothing exported. SUPABASE_URL, COMPOSE_PROJECT and DB_CONTAINER still win.
//
// No `import.meta` here: Playwright compiles the e2e specs, and this file through proof-kit.ts, to
// CommonJS, where it does not exist. The config is found from the working directory instead.
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

/** @param {string} toml @param {Record<string, string | undefined>} env */
export function stackFrom(toml, env) {
  // ponytail: just the two keys, not a TOML parser. A chunk per `[section]`; the first is top level.
  const [top, ...sections] = toml.split(/^\[/m);
  const projectId = top.match(/^project_id\s*=\s*"([^"]+)"/m)?.[1];
  const port = sections.find((s) => s.startsWith('api]'))?.match(/^port\s*=\s*(\d+)/m)?.[1];
  if (!projectId || !port) {
    throw new Error('supabase/config.toml: no top-level project_id or no port under [api]');
  }
  const project = env.COMPOSE_PROJECT ?? projectId;
  return {
    apiUrl: env.SUPABASE_URL ?? `http://127.0.0.1:${port}`,
    project,
    dbContainer: env.DB_CONTAINER ?? `supabase_db_${project}`,
  };
}

/** supabase/config.toml of the nearest folder, from `from` up. @param {string} from */
export function findConfig(from) {
  for (let dir = from; ; dir = dirname(dir)) {
    const file = join(dir, 'supabase', 'config.toml');
    if (existsSync(file)) return file;
    if (dirname(dir) === dir) throw new Error(`no supabase/config.toml in ${from} or above`);
  }
}

export const { apiUrl, project, dbContainer } = stackFrom(
  readFileSync(findConfig(process.cwd()), 'utf8'),
  process.env,
);
