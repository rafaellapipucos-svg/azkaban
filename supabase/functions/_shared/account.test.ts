// The handlers of account-export and account-delete in Node, against a fake service role client: the
// user check, the recent sign-in, the limit, the order of the deletion steps and what reaches the log.
// The integration tests (account.integration.test.ts) run the real functions against the stack.
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { afterEach, beforeEach, describe, test } from 'node:test';
import { privacyDefaults } from '../../../packages/config/src/limits.ts';

// The contract files import each other without an extension, as the deno.json maps them.
registerHooks({
  resolve: (specifier, context, next) =>
    context.parentURL?.includes('/packages/contracts/src/') &&
    specifier.startsWith('.') &&
    !specifier.endsWith('.ts')
      ? next(`${specifier}.ts`, context)
      : next(specifier, context),
});
const { handleDelete, handleExport, lastAuthenticatedAt } = await import('./account.ts');
const { accountExportSchema, accountExportSections } =
  await import('../../../packages/contracts/src/privacy.ts');

const USER = '11111111-1111-4111-8111-111111111111';
const NOW = new Date('2026-11-03T12:00:00.000Z');
const seconds = (date: Date) => Math.floor(date.getTime() / 1000);
const b64 = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');
/** The claims matter here, not the signature: the fake Auth accepts any token it was told about. */
const jwt = (claims: object) => `${b64({ alg: 'HS256' })}.${b64({ sub: USER, ...claims })}.sig`;
const minutesAgo = (m: number) => seconds(new Date(NOW.getTime() - m * 60_000));
const FRESH = jwt({ amr: [{ method: 'password', timestamp: minutesAgo(1) }] });

type Result = { data?: unknown; error?: Record<string, unknown> | null };
type Fake = {
  tokens?: string[];
  rpc?: Record<string, (args: Record<string, unknown>) => Result>;
  sign?: (paths: string[]) => Result;
  remove?: (paths: string[]) => Result;
  deleteUser?: () => Result;
};

function fakeAdmin(fake: Fake = {}) {
  const calls: string[] = [];
  const rpcArgs: Record<string, Record<string, unknown>> = {};
  const done = (r: Result) => Promise.resolve({ data: r.data ?? null, error: r.error ?? null });
  const admin = {
    auth: {
      getUser: (token: string) => {
        calls.push('getUser');
        return (fake.tokens ?? [FRESH]).includes(token)
          ? done({ data: { user: { id: USER } } })
          : done({ data: { user: null }, error: { message: 'invalid JWT' } });
      },
      admin: {
        deleteUser: (id: string) => {
          calls.push(`deleteUser:${id === USER}`);
          return done(fake.deleteUser?.() ?? { data: {} });
        },
      },
    },
    rpc: (fn: string, args: Record<string, unknown>) => {
      calls.push(fn);
      rpcArgs[fn] = args;
      const answer = fake.rpc?.[fn];
      if (!answer) throw new Error(`unexpected rpc ${fn}`);
      return done(answer(args));
    },
    storage: {
      from: (bucket: string) => {
        assert.equal(bucket, 'task-proofs');
        return {
          createSignedUrls: (paths: string[], ttl: number) => {
            calls.push(`sign:${paths.length}`);
            assert.equal(ttl, privacyDefaults.exportPhotoUrlTtlSeconds);
            return done(fake.sign?.(paths) ?? { data: [] });
          },
          remove: (paths: string[]) => {
            calls.push(`remove:${paths.length}`);
            return done(fake.remove?.(paths) ?? { data: paths.map((name) => ({ name })) });
          },
        };
      },
    },
  };
  return { admin: admin as never, calls, rpcArgs };
}

const post = (token: string | null, body?: string) =>
  new Request('http://local/fn', {
    method: 'POST',
    headers: token ? { authorization: `Bearer ${token}` } : {},
    body,
  });
const json = async (res: Response) => ({ status: res.status, body: await res.json() });

let logs: string[] = [];
const original = { log: console.log, error: console.error };
beforeEach(() => {
  logs = [];
  console.log = (line: string) => logs.push(line);
  console.error = (line: string) => logs.push(line);
});
afterEach(() => {
  Object.assign(console, original);
  // No id, path or URL ever reaches a log line.
  for (const line of logs) assert.doesNotMatch(line, /1111|occ-|https?:/, line);
});

describe('lastAuthenticatedAt', () => {
  test('the latest timestamp of amr, null without one', () => {
    const t = minutesAgo(3);
    assert.equal(
      lastAuthenticatedAt(
        jwt({
          amr: [
            { method: 'password', timestamp: t - 100 },
            { method: 'otp', timestamp: t },
          ],
        }),
      ),
      t,
    );
    assert.equal(lastAuthenticatedAt(jwt({})), null);
    assert.equal(lastAuthenticatedAt(jwt({ amr: [{ method: 'password' }] })), null);
    assert.equal(lastAuthenticatedAt(jwt({ amr: 'password' })), null);
    assert.equal(lastAuthenticatedAt('not-a-jwt'), null);
  });
});

// ------------------------------------------------------------------------------------------ export

const sections = () =>
  Object.fromEntries(accountExportSections.map((name) => [name, [] as Record<string, unknown>[]]));

function exporting(photoPaths: Record<string, string>, signedPaths = Object.values(photoPaths)) {
  const data = sections();
  data.proofs = [
    { id: 'p1', photo_url: null },
    { id: 'p2', photo_url: null },
    { id: 'p3', photo_url: null },
  ];
  return fakeAdmin({
    rpc: {
      consume_rate_limit: () => ({ data: null }),
      export_user_data: () => ({ data: { sections: data, photoPaths } }),
    },
    sign: (paths) => ({
      data: paths.map((path) => ({
        path,
        signedUrl: signedPaths.includes(path) ? `https://storage/${path}?token=x` : null,
        error: signedPaths.includes(path) ? null : 'Object not found',
      })),
    }),
  });
}

describe('handleExport', () => {
  test('signs each photo into its own row and answers the contract as a download', async () => {
    const fake = exporting({ p1: 'occ-1/a.jpg', p2: 'occ-2/b.jpg' }, ['occ-1/a.jpg']);
    const res = await handleExport(post(FRESH), fake.admin, NOW);
    assert.equal(res.status, 200);
    assert.equal(
      res.headers.get('content-disposition'),
      'attachment; filename="azkaban-dados-2026-11-03.json"',
    );
    assert.equal(res.headers.get('cache-control'), 'no-store');
    const body = accountExportSchema.parse(await res.json());
    assert.equal(body.userId, USER);
    assert.equal(body.generatedAt, NOW.toISOString());
    assert.equal(
      body.photoUrlsExpireAt,
      new Date(NOW.getTime() + privacyDefaults.exportPhotoUrlTtlSeconds * 1000).toISOString(),
    );
    assert.deepEqual(Object.keys(body.sections).sort(), [...accountExportSections].sort());
    assert.deepEqual(
      body.sections.proofs!.map((row) => [row.id, row.photo_url]),
      [
        ['p1', 'https://storage/occ-1/a.jpg?token=x'],
        // Removed by the retention after the read.
        ['p2', null],
        // No photo at all.
        ['p3', null],
      ],
    );
    assert.deepEqual(fake.calls, ['getUser', 'consume_rate_limit', 'export_user_data', 'sign:2']);
    assert.deepEqual(fake.rpcArgs.consume_rate_limit, { p_user: USER, p_action: 'data_export' });
    assert.deepEqual(fake.rpcArgs.export_user_data, { p_user: USER });
  });

  test('without photos nothing is signed and the expiry is null', async () => {
    const fake = exporting({});
    const body = (await json(await handleExport(post(FRESH), fake.admin, NOW))).body;
    assert.equal(body.photoUrlsExpireAt, null);
    assert.ok(!fake.calls.some((c) => c.startsWith('sign')));
  });

  test('no user, an unknown token or a key without a user: 401 and the database is not asked', async () => {
    for (const req of [post(null), post('anon-key'), post(jwt({}))]) {
      const fake = exporting({});
      assert.deepEqual(await json(await handleExport(req, fake.admin, NOW)), {
        status: 401,
        body: { error: 'unauthorized' },
      });
      assert.ok(!fake.calls.includes('consume_rate_limit'));
    }
  });

  test('over the limit: 429 with the wait from the hint, and nothing is read', async () => {
    const fake = fakeAdmin({
      rpc: {
        consume_rate_limit: () => ({
          error: { code: 'PT429', message: 'rate_limited', hint: '7200' },
        }),
      },
    });
    assert.deepEqual(await json(await handleExport(post(FRESH), fake.admin, NOW)), {
      status: 429,
      body: { error: 'rate_limited', retryAfterSeconds: 7200 },
    });
    assert.ok(!fake.calls.includes('export_user_data'));
  });

  test('another failure of the limit or of the read is export_failed', async () => {
    const broken = fakeAdmin({
      rpc: { consume_rate_limit: () => ({ error: { code: '42501', message: 'denied' } }) },
    });
    assert.deepEqual(await json(await handleExport(post(FRESH), broken.admin, NOW)), {
      status: 500,
      body: { error: 'export_failed' },
    });
    const unread = fakeAdmin({
      rpc: {
        consume_rate_limit: () => ({ data: null }),
        export_user_data: () => ({ error: { code: 'P0002', message: 'account_not_found' } }),
      },
    });
    assert.equal((await handleExport(post(FRESH), unread.admin, NOW)).status, 500);
  });

  test('only POST and OPTIONS', async () => {
    const fake = exporting({});
    const get = new Request('http://local/fn', { method: 'GET' });
    assert.equal((await handleExport(get, fake.admin, NOW)).status, 405);
    const preflight = new Request('http://local/fn', { method: 'OPTIONS' });
    assert.equal((await handleExport(preflight, fake.admin, NOW)).status, 204);
  });
});

// ------------------------------------------------------------------------------------------ delete

const PREVIEW = { blockingGroups: [], soloGroups: [{ id: USER, name: 'mine' }] };
const BLOCKED = {
  blockingGroups: [{ id: USER, name: 'family', memberCount: 3 }],
  soloGroups: [],
};

function deleting(fake: Partial<Fake> & { paths?: string[] } = {}) {
  return fakeAdmin({
    ...fake,
    tokens: fake.tokens,
    rpc: {
      account_deletion_preview: () => ({ data: PREVIEW }),
      begin_account_deletion: () => ({
        data: { deletionId: USER, preview: PREVIEW, storagePaths: fake.paths ?? ['occ-1/a.jpg'] },
      }),
      finish_account_deletion: () => ({ data: { groupsDeleted: 1, proofsDeleted: 2 } }),
      complete_account_deletion: () => ({ data: { auditEntriesDeleted: 4 } }),
      ...fake.rpc,
    },
  });
}
const confirm = (token = FRESH) => post(token, JSON.stringify({ dryRun: false }));

describe('handleDelete', () => {
  test('runs the steps in the order of the ADR and answers deleted', async () => {
    const fake = deleting({ paths: ['occ-1/a.jpg', 'occ-1/b.jpg'] });
    assert.deepEqual(await json(await handleDelete(confirm(), fake.admin, NOW)), {
      status: 200,
      body: { deleted: true },
    });
    assert.deepEqual(fake.calls, [
      'getUser',
      'begin_account_deletion',
      'remove:2',
      'finish_account_deletion',
      'deleteUser:true',
      'complete_account_deletion',
    ]);
    assert.deepEqual(fake.rpcArgs.finish_account_deletion, {
      p_user: USER,
      p_objects_deleted: 2,
    });
    assert.deepEqual(fake.rpcArgs.complete_account_deletion, {
      p_user: USER,
      p_retention_days: privacyDefaults.deletionLogRetentionDays,
    });
  });

  test('removes in batches and counts what Storage says it removed', async () => {
    const paths = Array.from({ length: 1500 }, (_, i) => `occ-1/${i}.jpg`);
    const fake = deleting({ paths, remove: (batch) => ({ data: batch.slice(1) }) });
    assert.equal((await handleDelete(confirm(), fake.admin, NOW)).status, 200);
    assert.deepEqual(
      fake.calls.filter((c) => c.startsWith('remove')),
      ['remove:1000', 'remove:500'],
    );
    assert.equal(fake.rpcArgs.finish_account_deletion!.p_objects_deleted, 1498);
  });

  test('dryRun answers the preview and deletes nothing', async () => {
    const fake = deleting();
    const res = await json(
      await handleDelete(post(FRESH, JSON.stringify({ dryRun: true })), fake.admin, NOW),
    );
    assert.deepEqual(res, { status: 200, body: PREVIEW });
    assert.deepEqual(fake.calls, ['getUser', 'account_deletion_preview']);
  });

  test('a sign-in older than the limit is reauth_required, the preview included; at the limit it passes', async () => {
    const max = privacyDefaults.reauthMaxAgeMinutes;
    const old = jwt({ amr: [{ method: 'password', timestamp: minutesAgo(max) - 1 }] });
    const none = jwt({});
    const edge = jwt({ amr: [{ method: 'magiclink', timestamp: minutesAgo(max) }] });
    for (const token of [old, none]) {
      for (const dryRun of [true, false]) {
        const fake = deleting({ tokens: [token] });
        const req = post(token, JSON.stringify({ dryRun }));
        assert.deepEqual(await json(await handleDelete(req, fake.admin, NOW)), {
          status: 401,
          body: { error: 'reauth_required' },
        });
        assert.deepEqual(fake.calls, ['getUser']);
      }
    }
    const fake = deleting({ tokens: [edge] });
    assert.equal((await handleDelete(confirm(edge), fake.admin, NOW)).status, 200);
  });

  test('no user: 401 unauthorized, before the body or the sign-in time', async () => {
    for (const token of [null, 'anon-key']) {
      const fake = deleting();
      assert.deepEqual(await json(await handleDelete(confirm(token as string), fake.admin, NOW)), {
        status: 401,
        body: { error: 'unauthorized' },
      });
      assert.deepEqual(fake.calls, token ? ['getUser'] : []);
    }
  });

  test('an owned group with members: 409 with the preview, from begin and from finish', async () => {
    const owns = () => ({
      error: { code: 'P0001', message: 'owns_groups', details: JSON.stringify(BLOCKED) },
    });
    const atBegin = deleting({ rpc: { begin_account_deletion: owns } });
    assert.deepEqual(await json(await handleDelete(confirm(), atBegin.admin, NOW)), {
      status: 409,
      body: { error: 'owns_groups', preview: BLOCKED },
    });
    assert.deepEqual(atBegin.calls, ['getUser', 'begin_account_deletion']);

    // Someone joined a solo group between the steps: the photos are gone, the account is not.
    const atFinish = deleting({ rpc: { finish_account_deletion: owns } });
    assert.equal((await handleDelete(confirm(), atFinish.admin, NOW)).status, 409);
    assert.ok(!atFinish.calls.some((c) => c.startsWith('deleteUser')));
  });

  test('a failure midway is delete_failed and stops there', async () => {
    const storage = deleting({ remove: () => ({ error: { message: 'boom' } }) });
    assert.deepEqual(await json(await handleDelete(confirm(), storage.admin, NOW)), {
      status: 500,
      body: { error: 'delete_failed' },
    });
    assert.ok(!storage.calls.includes('finish_account_deletion'));

    const auth = deleting({ deleteUser: () => ({ error: { status: 500, code: 'unexpected' } }) });
    assert.equal((await handleDelete(confirm(), auth.admin, NOW)).status, 500);
    assert.ok(!auth.calls.includes('complete_account_deletion'));

    // A deletion that raced this one removed the user first.
    const raced = deleting({
      deleteUser: () => ({ error: { status: 404, code: 'user_not_found' } }),
    });
    assert.equal((await handleDelete(confirm(), raced.admin, NOW)).status, 200);

    // After deleteUser the account is gone: the answer is still deleted.
    const late = deleting({
      rpc: { complete_account_deletion: () => ({ error: { code: '42501', message: 'x' } }) },
    });
    assert.equal((await handleDelete(confirm(), late.admin, NOW)).status, 200);
  });

  test('the body is { dryRun } and at most 1 KiB', async () => {
    for (const body of [
      '',
      '{nope',
      '{}',
      JSON.stringify({ dryRun: 'yes' }),
      JSON.stringify({ dryRun: true, extra: 1 }),
    ]) {
      const fake = deleting();
      assert.deepEqual(
        await json(await handleDelete(post(FRESH, body), fake.admin, NOW)),
        { status: 400, body: { error: 'invalid_request' } },
        body,
      );
    }
    const padded = (size: number) => JSON.stringify({ dryRun: true }).padEnd(size, ' ');
    assert.equal(
      (await handleDelete(post(FRESH, padded(1024)), deleting().admin, NOW)).status,
      200,
    );
    assert.equal(
      (await handleDelete(post(FRESH, padded(1025)), deleting().admin, NOW)).status,
      400,
    );
  });
});
