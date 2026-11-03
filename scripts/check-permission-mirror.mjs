// Fails when the database differs from its mirrors in code: the permission matrix in packages/core,
// occurrenceTransitions in packages/contracts, and taskRules, proofRules, notificationRules and whatsappRules in
// packages/config. Needs `pnpm db:start`.
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const query = (sql) =>
  execSync(`docker exec supabase_db_azkaban psql -U postgres -At -c "${sql}"`)
    .toString()
    .trim()
    .split(/\r?\n/)
    .filter(Boolean)
    .sort();

// Node 24 strips the types. The two files below have no runtime imports on purpose.
const load = async (path) => import(pathToFileURL(path).href);

// Keys sorted, so the order inside the jsonb does not matter.
const canonical = (value) =>
  JSON.stringify(value, (_, v) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b)))
      : v,
  );

let failed = false;
const report = (name, rows, expected) => {
  const missing = rows.filter((row) => !expected.includes(row));
  const extra = expected.filter((row) => !rows.includes(row));
  if (rows.length === 0 || missing.length > 0 || extra.length > 0) {
    console.error(`${name} out of sync.`, { missing: missing, extra });
    failed = true;
  } else {
    console.log(`${name} in sync (${rows.length} rows).`);
  }
};

// Permission matrix
const source = readFileSync('packages/core/src/permissions/matrix.ts', 'utf8');
const body = source.slice(source.indexOf('{') + 1, source.lastIndexOf('}'));
const mirror = [...body.matchAll(/(\w+):\s*\[([^\]]*)\]/g)]
  .flatMap(([, role, list]) => [...list.matchAll(/'([^']+)'/g)].map(([, key]) => `${role}|${key}`))
  .sort();
report(
  'Permission matrix',
  query('select role, permission_key from public.role_permissions'),
  mirror,
);

// Occurrence transitions
const { occurrenceTransitions } = await load('packages/contracts/src/occurrence-transitions.ts');
report(
  'Occurrence transitions',
  query('select from_status, to_status, actor from public.occurrence_transitions'),
  occurrenceTransitions
    .flatMap(({ from, to, actors }) => actors.map((a) => `${from}|${to}|${a}`))
    .sort(),
);

// Task rules
const { taskRules } = await load('packages/config/src/tasks.ts');
const [rules] = query("select value::text from public.app_settings where key = 'task_rules'");
if (!rules || canonical(JSON.parse(rules)) !== canonical(taskRules)) {
  console.error('Task rules out of sync.', { database: rules, code: canonical(taskRules) });
  failed = true;
} else {
  console.log('Task rules in sync.');
}

// Proof rules (ADR-0007): the row in app_settings, and the limits of the task-proofs bucket, which are the
// second barrier after the function. A bucket that took a larger file or another type would undo them.
const { proofRules } = await load('packages/config/src/proof.ts');
const [proofRow] = query("select value::text from public.app_settings where key = 'proof_rules'");
if (!proofRow || canonical(JSON.parse(proofRow)) !== canonical(proofRules)) {
  console.error('Proof rules out of sync.', { database: proofRow, code: canonical(proofRules) });
  failed = true;
} else {
  console.log('Proof rules in sync.');
}
const [bucket] = query(
  "select public::text || '|' || file_size_limit::text || '|' || array_to_string(allowed_mime_types, ',') from storage.buckets where id = 'task-proofs'",
);
const expectedBucket = `false|${proofRules.maxBytes}|${proofRules.contentType}`;
if (bucket !== expectedBucket) {
  console.error('Bucket task-proofs out of sync.', { database: bucket, code: expectedBucket });
  failed = true;
} else {
  console.log('Bucket task-proofs in sync (private, size and type from proofRules).');
}

// Notification rules (ADR-0008): channels, defaults, quiet hours, reminder scan, push hosts, the bell.
const { notificationRules } = await load('packages/config/src/notifications.ts');
const [notificationRow] = query(
  "select value::text from public.app_settings where key = 'notification_rules'",
);
if (!notificationRow || canonical(JSON.parse(notificationRow)) !== canonical(notificationRules)) {
  console.error('Notification rules out of sync.', {
    database: notificationRow,
    code: canonical(notificationRules),
  });
  failed = true;
} else {
  console.log('Notification rules in sync.');
}

// WhatsApp rules (ADR-0009): consent version, verification limits, the daily summary, retention.
const { whatsappRules } = await load('packages/config/src/whatsapp.ts');
const [whatsappRow] = query(
  "select value::text from public.app_settings where key = 'whatsapp_rules'",
);
if (!whatsappRow || canonical(JSON.parse(whatsappRow)) !== canonical(whatsappRules)) {
  console.error('WhatsApp rules out of sync.', {
    database: whatsappRow,
    code: canonical(whatsappRules),
  });
  failed = true;
} else {
  console.log('WhatsApp rules in sync.');
}

// Time zones: the database takes a name only if Intl reads it too, or taskSchema.parse would fail on a
// task the database accepted ('Factory' is in the tz database and not in Intl).
const zones = query('select name from pg_timezone_names where public.is_valid_timezone(name)');
const unreadable = zones.filter((zone) => {
  try {
    new Intl.DateTimeFormat('en', { timeZone: zone });
    return false;
  } catch {
    return true;
  }
});
if (zones.length === 0 || unreadable.length > 0) {
  console.error('Time zones accepted by the database but rejected by Intl.', { unreadable });
  failed = true;
} else {
  console.log(`Time zones readable by Intl (${zones.length} names).`);
}

// pg_net lets any role that can run SQL make HTTP calls, and its grants belong to supabase_admin, so a
// migration cannot revoke them. What keeps clients away is that PostgREST does not expose the schema.
const config = readFileSync('supabase/config.toml', 'utf8');
const api = config.match(/^\[api\]\s*$([\s\S]*?)(?=^\[)/m)?.[1] ?? '';
const exposed = [
  ...(api.match(/^schemas\s*=\s*\[([^\]]*)\]/m)?.[1] ?? '').matchAll(/"([^"]+)"/g),
].map(([, schema]) => schema);
const forbidden = exposed.filter((schema) => ['net', 'cron', 'vault'].includes(schema));
if (exposed.length === 0 || forbidden.length > 0) {
  console.error('api.schemas in supabase/config.toml must be set and must not expose these.', {
    exposed,
    forbidden,
  });
  failed = true;
} else {
  console.log(`API exposes only ${exposed.join(', ')}.`);
}

if (failed) process.exit(1);
