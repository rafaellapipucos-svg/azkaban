// Fixtures of the integration tests of the proof functions. Test code only: no function imports it.
//
//   pnpm db:start     (or: pnpm exec supabase start)
//   cp supabase/functions/.env.example supabase/functions/.env     # once; ignored by git
//   pnpm exec supabase functions serve                             # leave it running
//   pnpm functions:test                                            # another terminal
//
// Do not edit files under supabase/functions while `functions serve` runs: it restarts the runtime and
// the next call gets a 502. A few tests need `docker exec` into the local database container
// (DB_CONTAINER, default supabase_db_azkaban) for what the API cannot do, such as backdating a row
// that a trigger protects.
//
// The keys and the JWT secret below are the universal demo values of every local Supabase stack, not
// secrets. Users get a token minted with that secret, which skips the sign-in rate limit of Auth
// (30 per 5 minutes per IP) that a test per user would hit; one test per file signs in for real.
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { createHash, createHmac, randomUUID } from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export const API = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54421';
export const ANON =
  process.env.SUPABASE_ANON_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';
const SERVICE =
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';
const JWT_SECRET =
  process.env.SUPABASE_JWT_SECRET ?? 'super-secret-jwt-token-with-at-least-32-characters-long';
export const CRON_SECRET = process.env.CRON_SECRET ?? 'local-demo-cron-secret';
export const functionUrl = (name: string) => `${API}/functions/v1/${name}`;

export const options = { auth: { persistSession: false, autoRefreshToken: false } };
export const admin: SupabaseClient = createClient(API, SERVICE, options);
export const anon: SupabaseClient = createClient(API, ANON, options);

export type Reply = { status: number; body: any; headers: Headers };
async function toReply(response: Response): Promise<Reply> {
  const text = await response.text();
  let body: unknown = text;
  try {
    body = JSON.parse(text);
  } catch {
    // Not JSON: the gateway answers some refusals as text.
  }
  return { status: response.status, body, headers: response.headers };
}

// ---------------------------------------------------------------------------------------- database

const DB_CONTAINER = process.env.DB_CONTAINER ?? 'supabase_db_azkaban';
/** One statement (or several, in one transaction) as the database owner. Returns the first column of each row. */
export function sql(statement: string): string[] {
  const out = execFileSync(
    'docker',
    [
      'exec',
      '-i',
      DB_CONTAINER,
      'psql',
      '-U',
      'postgres',
      '-v',
      'ON_ERROR_STOP=1',
      '-tA',
      '-c',
      statement,
    ],
    { stdio: 'pipe' },
  ).toString();
  return out
    .split('\n')
    .map((line) => line.trim())
    .filter(
      (line) => line !== '' && !/^(UPDATE|INSERT|DELETE|ALTER|SET|BEGIN|COMMIT)\b/.test(line),
    );
}

/** Backdates a proof past retention. A trigger forbids changing `received_at`, service role included, so it is switched off for this one statement. */
export function backdateProof(proofId: string, interval: string) {
  sql(`begin;
    alter table public.task_proofs disable trigger task_proofs_before_update;
    update public.task_proofs set received_at = received_at - interval '${interval}' where id = '${proofId}';
    alter table public.task_proofs enable trigger task_proofs_before_update;
    commit;`);
}

// ----------------------------------------------------------------------------------------- people

export type Person = { id: string; client: SupabaseClient; bearer: Record<string, string> };

const b64 = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');
function mint(sub: string): string {
  const now = Math.floor(Date.now() / 1000);
  const head = b64({ alg: 'HS256', typ: 'JWT' });
  const body = b64({ sub, role: 'authenticated', aud: 'authenticated', iat: now, exp: now + 3600 });
  const sig = createHmac('sha256', JWT_SECRET).update(`${head}.${body}`).digest('base64url');
  return `${head}.${body}.${sig}`;
}

const created: string[] = [];

/** A user. `signIn` goes through Auth with a password, as an app would. */
export async function newPerson(name: string, signIn = false): Promise<Person> {
  const email = `${name}-${randomUUID()}@example.com`;
  const password = randomUUID();
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  assert.ifError(error);
  created.push(data.user!.id);
  let token = mint(data.user!.id);
  if (signIn) {
    const session = await createClient(API, ANON, options).auth.signInWithPassword({
      email,
      password,
    });
    assert.ifError(session.error);
    token = session.data.session!.access_token;
  }
  const client = createClient(API, ANON, {
    ...options,
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  return { id: data.user!.id, client, bearer: { authorization: `Bearer ${token}` } };
}

// ------------------------------------------------------------------------------------------ group

export type Group = {
  id: string;
  owner: Person;
  /** Role `admin`: has proof.review. */
  reviewer: Person;
  /** Role `member`, never an author. */
  peer: Person;
  plainContext: string;
  /** -23.55, -46.63, radius 150 m. */
  placeContext: string;
};
export const PLACE = { lat: -23.55, lng: -46.63, radiusM: 150 };

export async function newGroup(): Promise<Group> {
  const owner = await newPerson('owner');
  const reviewer = await newPerson('reviewer');
  const peer = await newPerson('peer');
  const group = await admin
    .from('groups')
    .insert({ name: 'proof check', type: 'family', owner_id: owner.id })
    .select('id')
    .single();
  assert.ifError(group.error);
  const members = await admin.from('group_members').insert([
    { group_id: group.data!.id, user_id: reviewer.id, role: 'admin' },
    { group_id: group.data!.id, user_id: peer.id, role: 'member' },
  ]);
  assert.ifError(members.error);
  const area = await admin.from('areas').select('id').limit(1).single();
  assert.ifError(area.error);
  const base = {
    area_id: area.data!.id,
    group_id: group.data!.id,
    color_token: 'x',
    icon: 'x',
    created_by: owner.id,
  };
  const contexts = await admin
    .from('contexts')
    .insert([
      { ...base, name: 'plain' },
      {
        ...base,
        name: 'place',
        location_address: 'Rua A, 1',
        location_lat: PLACE.lat,
        location_lng: PLACE.lng,
        location_radius_m: PLACE.radiusM,
      },
    ])
    .select('id, name');
  assert.ifError(contexts.error);
  return {
    id: group.data!.id as string,
    owner,
    reviewer,
    peer,
    plainContext: contexts.data!.find((c) => c.name === 'plain')!.id as string,
    placeContext: contexts.data!.find((c) => c.name === 'place')!.id as string,
  };
}

/** Someone who is going to send a proof. Consented to the notice unless told otherwise. */
export async function newAuthor(
  group: Group,
  { consent = true, signIn = false }: { consent?: boolean; signIn?: boolean } = {},
): Promise<Person> {
  const author = await newPerson('author', signIn);
  const joined = await admin
    .from('group_members')
    .insert({ group_id: group.id, user_id: author.id, role: 'member' });
  assert.ifError(joined.error);
  if (consent) {
    const accepted = await author.client.rpc('record_proof_consent', { p_version: 1 });
    assert.ifError(accepted.error);
  }
  return author;
}

const occurrences: string[] = [];

export type Spot = { taskId: string; occurrenceId: string };
/** A task that needs a photo, with its single occurrence, due in two days. */
export async function newOccurrence(
  group: Group,
  author: Person,
  spec: { approval?: boolean; place?: boolean; visibility?: 'group' | 'private' } = {},
): Promise<Spot> {
  const task = await admin
    .from('tasks')
    .insert({
      context_id: spec.place ? group.placeContext : group.plainContext,
      created_by: author.id,
      assignee_id: author.id,
      title: 'proof check',
      schedule_type: 'timed',
      start_at: new Date(Date.now() + 2 * 86_400_000).toISOString(),
      duration_min: 60,
      timezone: 'America/Sao_Paulo',
      rrule: null,
      reminders: [],
      requires_photo_proof: true,
      requires_admin_approval: spec.approval ?? false,
      requires_partial_reason: false,
      difficulty: 'easy',
      priority: 'normal',
      visibility: spec.visibility ?? 'group',
    })
    .select('id')
    .single();
  assert.ifError(task.error);
  const occurrence = await admin
    .from('task_occurrences')
    .select('id')
    .eq('task_id', task.data!.id)
    .single();
  assert.ifError(occurrence.error);
  occurrences.push(occurrence.data!.id as string);
  return { taskId: task.data!.id as string, occurrenceId: occurrence.data!.id as string };
}

export async function challenge(author: Person, occurrenceId: string): Promise<string> {
  const { data, error } = await author.client.rpc('issue_proof_challenge', {
    p_occurrence_id: occurrenceId,
  });
  assert.ifError(error);
  assert.equal(data.expiresInSeconds, 300);
  return data.nonce as string;
}

// ------------------------------------------------------------------------------------------ bytes

export const sha256Hex = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');

export type Meta = {
  nonce: string;
  sha256: string;
  capturedAtDevice: string;
  location: { lat: number; lng: number; accuracyM: number } | null;
  platform: 'web' | 'ios' | 'android';
  appVersion: string;
};

export type UploadOptions = {
  meta?: Partial<Meta>;
  /** Replaces the whole header value. */
  rawMeta?: string;
  /** `null` removes the header. */
  headers?: Record<string, string | null>;
};

function uploadHeaders(who: Person | null, nonce: string, bytes: Uint8Array, o: UploadOptions) {
  const meta: Meta = {
    nonce,
    sha256: sha256Hex(bytes),
    capturedAtDevice: new Date().toISOString(),
    location: null,
    platform: 'web',
    appVersion: '1.0.0',
    ...o.meta,
  };
  const headers: Record<string, string> = {
    ...(who?.bearer ?? {}),
    'content-type': 'image/jpeg',
    'user-agent': 'azkaban-test/1',
    'x-proof-meta': o.rawMeta ?? encodeURIComponent(JSON.stringify(meta)),
  };
  for (const [name, value] of Object.entries(o.headers ?? {})) {
    if (value === null) delete headers[name];
    else headers[name] = value;
  }
  return headers;
}

export async function upload(
  who: Person | null,
  nonce: string,
  bytes: Uint8Array,
  o: UploadOptions = {},
): Promise<Reply> {
  return toReply(
    await fetch(functionUrl('proof-validate'), {
      method: 'POST',
      headers: uploadHeaders(who, nonce, bytes, o),
      body: bytes,
    }),
  );
}

/** Like `upload`, with a body that arrives in pieces: no Content-Length. */
export async function uploadStream(
  who: Person,
  nonce: string,
  stream: ReadableStream<Uint8Array>,
  hashOf: Uint8Array,
  o: UploadOptions = {},
): Promise<Reply> {
  return toReply(
    await fetch(functionUrl('proof-validate'), {
      method: 'POST',
      headers: uploadHeaders(who, nonce, hashOf, o),
      body: stream,
      // @ts-expect-error Node's fetch needs this for a stream body.
      duplex: 'half',
    }),
  );
}

/**
 * A request straight to the Edge Runtime, without the API gateway. Kong buffers a request body whole
 * before it forwards it, so through the gateway the function cannot be seen reading a stream: a body
 * that stalls never reaches it, and one past the limit arrives complete. This speaks HTTP/1.1 with
 * `Transfer-Encoding: chunked` through `nc` inside the Kong container, which sits on the same Docker
 * network, so the test controls when each piece leaves and sees when the function stops reading.
 */
export function rawUpload(who: Person, nonce: string, hashOf: Uint8Array, o: UploadOptions = {}) {
  const project = process.env.COMPOSE_PROJECT ?? 'azkaban';
  const child = spawn(
    'docker',
    ['exec', '-i', `supabase_kong_${project}`, 'nc', `supabase_edge_runtime_${project}`, '8081'],
    { stdio: ['pipe', 'pipe', 'ignore'] },
  );
  const headers = {
    ...uploadHeaders(who, nonce, hashOf, o),
    host: 'edge-runtime',
    'transfer-encoding': 'chunked',
    connection: 'close',
  };
  let closed = false;
  let output = Buffer.alloc(0);
  let written = 0;
  child.stdin.on('error', () => {});
  // busybox nc does not exit when the server closes, so the answer is whatever arrived once the line
  // has been quiet for a moment. The answers of the functions are one small packet.
  const reply = new Promise<Reply>((resolve) => {
    let quiet: ReturnType<typeof setTimeout> | undefined;
    const finish = () => {
      closed = true;
      child.kill();
      resolve(parseHttp(output));
    };
    child.stdout.on('data', (data: Buffer) => {
      output = Buffer.concat([output, data]);
      clearTimeout(quiet);
      quiet = setTimeout(finish, 200);
    });
    child.on('close', () => {
      clearTimeout(quiet);
      if (!closed) finish();
    });
  });
  child.stdin.write(
    `POST /proof-validate HTTP/1.1\r\n${Object.entries(headers)
      .map(([name, value]) => `${name}: ${value}\r\n`)
      .join('')}\r\n`,
  );
  return {
    reply,
    /** Bytes of body handed to the pipe. The pipe buffers some, so this can pass what the function read. */
    written: () => written,
    isOpen: () => !closed,
    /** One chunk. Resolves when the pipe took it, or the connection is gone. */
    send(bytes: Uint8Array): Promise<void> {
      if (closed || child.stdin.destroyed) return Promise.resolve();
      written += bytes.length;
      child.stdin.write(`${bytes.length.toString(16)}\r\n`);
      child.stdin.write(bytes);
      const ok = child.stdin.write('\r\n');
      // Backpressure, but never past the end of the connection: nothing drains once it is gone.
      return ok
        ? Promise.resolve()
        : new Promise((resolve) => {
            child.stdin.once('drain', resolve);
            void reply.then(resolve);
          });
    },
    end() {
      if (!closed && !child.stdin.destroyed) child.stdin.write('0\r\n\r\n');
    },
    kill() {
      child.kill();
    },
  };
}

function parseHttp(raw: Buffer): Reply {
  const split = raw.indexOf('\r\n\r\n');
  if (split < 0) return { status: 0, body: raw.toString(), headers: new Headers() };
  const [statusLine, ...lines] = raw.subarray(0, split).toString().split('\r\n');
  const headers = new Headers();
  for (const line of lines) {
    const at = line.indexOf(':');
    if (at > 0) headers.append(line.slice(0, at).trim(), line.slice(at + 1).trim());
  }
  let body = raw.subarray(split + 4);
  if (headers.get('transfer-encoding')?.includes('chunked')) {
    const parts: Buffer[] = [];
    let at = 0;
    while (at < body.length) {
      const end = body.indexOf('\r\n', at);
      const size = parseInt(body.subarray(at, end).toString(), 16);
      if (!size) break;
      parts.push(body.subarray(end + 2, end + 2 + size));
      at = end + 2 + size + 2;
    }
    body = Buffer.concat(parts);
  }
  const text = body.toString();
  let parsed: unknown = text;
  try {
    parsed = JSON.parse(text);
  } catch {
    // Not JSON.
  }
  return { status: Number(statusLine!.split(' ')[1]), body: parsed, headers };
}

// -------------------------------------------------------------------------------------- inspection

export async function objectsOf(occurrenceId: string): Promise<string[]> {
  const { data, error } = await admin.storage.from('task-proofs').list(occurrenceId);
  assert.ifError(error);
  return data!.map((entry) => entry.name);
}

export async function occurrenceRow(occurrenceId: string) {
  const { data, error } = await admin
    .from('task_occurrences')
    .select('status, current_proof_id, proof_review_status, late')
    .eq('id', occurrenceId)
    .single();
  assert.ifError(error);
  return data!;
}

export async function proofsOf(occurrenceId: string) {
  const { data, error } = await admin
    .from('task_proofs')
    .select('*')
    .eq('occurrence_id', occurrenceId);
  assert.ifError(error);
  return data!;
}

/** `used_at` of a nonce, null while it is unspent. */
export function usedAt(nonce: string): string | null {
  const [value] = sql(
    `select coalesce(used_at::text, 'null') from public.proof_challenges where id = '${nonce}'`,
  );
  return value === 'null' ? null : (value ?? null);
}

export async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

/** Removes what the tests created: objects first (an account's deletion leaves them behind), then users and group. */
export async function cleanUp(groups: Group[]) {
  for (const id of occurrences.splice(0)) {
    const names = await objectsOf(id).catch(() => []);
    if (names.length > 0)
      await admin.storage.from('task-proofs').remove(names.map((n) => `${id}/${n}`));
  }
  for (const group of groups) {
    await admin.from('groups').delete().eq('id', group.id);
  }
  for (const id of created.splice(0)) await admin.auth.admin.deleteUser(id);
}
