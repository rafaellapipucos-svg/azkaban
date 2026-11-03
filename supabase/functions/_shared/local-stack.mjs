// The local stack that the tests of the functions talk to, read from the supabase/config.toml of this
// checkout: the `project_id` names the Docker containers and the `port` of `[api]` is the gateway. A
// checkout switched to the second stack (docs/agentes/ferramentas/pilha-b.sh) therefore reaches only
// that stack, with nothing exported. SUPABASE_URL, COMPOSE_PROJECT and DB_CONTAINER still win.
import { readFileSync } from 'node:fs';

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

export const { apiUrl, project, dbContainer } = stackFrom(
  readFileSync(new URL('../../config.toml', import.meta.url), 'utf8'),
  process.env,
);
