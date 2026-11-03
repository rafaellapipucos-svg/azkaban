// Fails when packages/core's matrix differs from public.role_permissions. Needs `pnpm db:start`.
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const source = readFileSync('packages/core/src/permissions/matrix.ts', 'utf8');
const body = source.slice(source.indexOf('{') + 1, source.lastIndexOf('}'));
const mirror = [...body.matchAll(/(\w+):\s*\[([^\]]*)\]/g)]
  .flatMap(([, role, list]) => [...list.matchAll(/'([^']+)'/g)].map(([, key]) => `${role}|${key}`))
  .sort();

const sql = 'select role, permission_key from public.role_permissions';
const rows = execSync(`docker exec supabase_db_azkaban psql -U postgres -At -c "${sql}"`)
  .toString()
  .trim()
  .split(/\r?\n/)
  .sort();

const missing = rows.filter((row) => !mirror.includes(row));
const extra = mirror.filter((row) => !rows.includes(row));

if (rows.length === 0 || missing.length > 0 || extra.length > 0) {
  console.error('Permission matrix out of sync.', { missing, extra });
  process.exit(1);
}
console.log(`Permission matrix in sync (${rows.length} rows).`);
