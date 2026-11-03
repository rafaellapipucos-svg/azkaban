// "Export my data" and "Delete my account" (ADR-0012, sections 2 and 3). The two Edge Functions are
// one line each; the handlers live here with the service role client as an argument, so Node runs
// them against a fake (account.test.ts). Only relative imports with an extension. Logs carry a stage,
// a code and counts: never an id, an e-mail, a path, a URL or a row.
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { privacyDefaults } from '../../../packages/config/src/limits.ts';
import {
  accountDeletePreviewSchema,
  accountDeleteRequestSchema,
  accountExportFormat,
  accountExportSchema,
  accountExportVersion,
  type PrivacyError,
} from '../../../packages/contracts/src/privacy.ts';
import { readLimited } from './body.ts';
import { responder, signedInUser } from './http.ts';

const BUCKET = 'task-proofs';
const MAX_BODY_BYTES = 1024;
const READ_TIMEOUT_MS = 10_000;
// ponytail: one size for both Storage batch calls; the API takes up to 1000 paths per remove.
const BATCH = 1000;

const reply = responder();
const fail = (event: string, stage: string, code: unknown, error: PrivacyError['error']) => {
  console.error(
    JSON.stringify({ event, stage, code: typeof code === 'string' ? code : undefined }),
  );
  return reply(500, { error } satisfies PrivacyError);
};

const chunks = <T>(items: T[]) =>
  Array.from({ length: Math.ceil(items.length / BATCH) }, (_, i) =>
    items.slice(i * BATCH, (i + 1) * BATCH),
  );

/** Seconds since the epoch of the latest `amr` entry of a JWT, or null without one. */
export function lastAuthenticatedAt(token: string): number | null {
  try {
    const part = token.split('.')[1]!.replace(/-/g, '+').replace(/_/g, '/');
    const bytes = Uint8Array.from(atob(part), (c) => c.charCodeAt(0));
    const amr: unknown = JSON.parse(new TextDecoder().decode(bytes)).amr;
    if (!Array.isArray(amr)) return null;
    const times = amr
      .map((entry) => (entry as { timestamp?: unknown })?.timestamp)
      .filter((t): t is number => typeof t === 'number' && Number.isFinite(t));
    return times.length > 0 ? Math.max(...times) : null;
  } catch {
    return null;
  }
}

/**
 * The session's last sign-in is at most `reauthMaxAgeMinutes` old. The token was already verified by
 * Auth (`signedInUser`), so its claims are trusted. ADR-0012, section 3, step 5: GoTrue keeps the
 * `amr` timestamp across refreshes. Without it the answer is no: the ADR's fallback,
 * `auth.sessions.created_at`, is not reachable through the API, and a missing claim only costs a sign-in.
 */
export function signedInRecently(token: string, now: Date): boolean {
  const at = lastAuthenticatedAt(token);
  return at !== null && now.getTime() - at * 1000 <= privacyDefaults.reauthMaxAgeMinutes * 60_000;
}

const exportedSchema = z.object({
  sections: z.record(z.string(), z.array(z.record(z.string(), z.unknown()))),
  photoPaths: z.record(z.string(), z.string()),
});

/** `account-export`: the whole file in one answer, with fresh signed links for the photos. */
export async function handleExport(
  req: Request,
  admin: SupabaseClient,
  now = new Date(),
): Promise<Response> {
  if (req.method === 'OPTIONS') return reply(204, null);
  if (req.method !== 'POST') return reply(405, { error: 'method_not_allowed' });
  try {
    const user = await signedInUser(admin, req.headers.get('authorization') ?? '');
    if (!user) return reply(401, { error: 'unauthorized' });
    // The request has no body: nothing is read.

    const limited = await admin.rpc('consume_rate_limit', {
      p_user: user.id,
      p_action: 'data_export',
    });
    if (limited.error) {
      if (limited.error.code !== 'PT429')
        return fail('account_export_failed', 'limit', limited.error.code, 'export_failed');
      const retryAfterSeconds = Math.max(1, Math.ceil(Number(limited.error.hint)) || 1);
      console.log(JSON.stringify({ event: 'account_export_refused', code: 'rate_limited' }));
      return reply(429, { error: 'rate_limited', retryAfterSeconds } satisfies PrivacyError);
    }

    const exported = await admin.rpc('export_user_data', { p_user: user.id });
    const data = exportedSchema.safeParse(exported.data);
    if (exported.error || !data.success)
      return fail('account_export_failed', 'read', exported.error?.code, 'export_failed');
    const { sections, photoPaths } = data.data;

    // Before signing, so the stated expiry is never later than the real one.
    const ttl = privacyDefaults.exportPhotoUrlTtlSeconds;
    const expiresAt = new Date(now.getTime() + ttl * 1000).toISOString();
    const urlOf = new Map<string, string>();
    for (const paths of chunks([...new Set(Object.values(photoPaths))])) {
      const signed = await admin.storage.from(BUCKET).createSignedUrls(paths, ttl);
      if (signed.error) return fail('account_export_failed', 'sign', undefined, 'export_failed');
      // An object the retention removed between the read and now comes back without a URL: null.
      for (const item of signed.data)
        if (item.path && item.signedUrl) urlOf.set(item.path, item.signedUrl);
    }
    for (const row of sections.proofs ?? []) {
      const path = photoPaths[String(row.id)];
      row.photo_url = (path && urlOf.get(path)) || null;
    }

    const body = accountExportSchema.safeParse({
      format: accountExportFormat,
      version: accountExportVersion,
      generatedAt: now.toISOString(),
      userId: user.id,
      photoUrlsExpireAt: Object.keys(photoPaths).length > 0 ? expiresAt : null,
      sections,
    });
    if (!body.success) return fail('account_export_failed', 'shape', undefined, 'export_failed');

    const day = now.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
    const res = reply(200, body.data);
    res.headers.set('content-disposition', `attachment; filename="azkaban-dados-${day}.json"`);
    res.headers.set('cache-control', 'no-store');
    console.log(JSON.stringify({ event: 'account_exported', photos: urlOf.size }));
    return res;
  } catch {
    console.error(JSON.stringify({ event: 'unexpected' }));
    return reply(500, { error: 'export_failed' } satisfies PrivacyError);
  }
}

const beginSchema = z.object({ storagePaths: z.array(z.string()) });
const finishSchema = z.object({ groupsDeleted: z.int(), proofsDeleted: z.int() });

/** `owns_groups` from begin or finish: 409 with the preview the database put in the detail. */
function ownsGroups(error: { message: string; details?: string | null }): Response | null {
  if (error.message !== 'owns_groups') return null;
  try {
    const preview = accountDeletePreviewSchema.parse(JSON.parse(error.details ?? ''));
    console.log(JSON.stringify({ event: 'account_delete_refused', code: 'owns_groups' }));
    return reply(409, { error: 'owns_groups', preview } satisfies PrivacyError);
  } catch {
    return null;
  }
}

/** `account-delete`: the preview with `dryRun`, otherwise the steps of ADR-0012, section 3, in order. */
export async function handleDelete(
  req: Request,
  admin: SupabaseClient,
  now = new Date(),
): Promise<Response> {
  if (req.method === 'OPTIONS') return reply(204, null);
  if (req.method !== 'POST') return reply(405, { error: 'method_not_allowed' });
  const failed = (stage: string, code?: unknown) =>
    fail('account_delete_failed', stage, code, 'delete_failed');
  try {
    const user = await signedInUser(admin, req.headers.get('authorization') ?? '');
    if (!user) return reply(401, { error: 'unauthorized' });

    const read = await readLimited(req.body, MAX_BODY_BYTES, READ_TIMEOUT_MS);
    if (read.kind !== 'ok') return reply(400, { error: 'invalid_request' });
    let raw: unknown;
    try {
      raw = JSON.parse(new TextDecoder().decode(read.bytes));
    } catch {
      return reply(400, { error: 'invalid_request' });
    }
    const input = accountDeleteRequestSchema.safeParse(raw);
    if (!input.success) return reply(400, { error: 'invalid_request' });

    // The preview asks for it too, so the screen sends the person to sign in before the confirmation.
    if (!signedInRecently(user.token, now)) {
      console.log(JSON.stringify({ event: 'account_delete_refused', code: 'reauth_required' }));
      return reply(401, { error: 'reauth_required' } satisfies PrivacyError);
    }

    if (input.data.dryRun) {
      const preview = await admin.rpc('account_deletion_preview', { p_user: user.id });
      const parsed = accountDeletePreviewSchema.safeParse(preview.data);
      if (preview.error || !parsed.success) return failed('preview', preview.error?.code);
      return reply(200, parsed.data);
    }

    // 1. Checks the blocks again and opens (or reuses) the audit row.
    const begun = await admin.rpc('begin_account_deletion', { p_user: user.id });
    if (begun.error) return ownsGroups(begun.error) ?? failed('begin', begun.error.code);
    const plan = beginSchema.safeParse(begun.data);
    if (!plan.success) return failed('begin');

    // 2. The photos. A path that is gone already is simply not in the answer.
    let objectsDeleted = 0;
    for (const paths of chunks(plan.data.storagePaths)) {
      const removed = await admin.storage.from(BUCKET).remove(paths);
      if (removed.error) return failed('storage');
      objectsDeleted += removed.data.length;
    }

    // 3. The user's proofs and solo groups, in one transaction.
    const finished = await admin.rpc('finish_account_deletion', {
      p_user: user.id,
      p_objects_deleted: objectsDeleted,
    });
    if (finished.error) return ownsGroups(finished.error) ?? failed('finish', finished.error.code);
    const counts = finishSchema.safeParse(finished.data);
    if (!counts.success) return failed('finish');

    // 4. The cascade from auth.users takes the rest. A 404 is a deletion that raced this one.
    const gone = await admin.auth.admin.deleteUser(user.id);
    if (gone.error && gone.error.status !== 404) return failed('auth', gone.error.code);

    // 5. The account is gone already, so a failure here is logged, not answered: a repeat would only
    // meet a 401. The audit row stays open, which is the worst of it.
    const completed = await admin.rpc('complete_account_deletion', {
      p_user: user.id,
      p_retention_days: privacyDefaults.deletionLogRetentionDays,
    });
    if (completed.error) {
      console.error(
        JSON.stringify({
          event: 'account_delete_failed',
          stage: 'complete',
          code: completed.error.code,
        }),
      );
    }

    console.log(
      JSON.stringify({
        event: 'account_deleted',
        objects: objectsDeleted,
        groups: counts.data.groupsDeleted,
        proofs: counts.data.proofsDeleted,
        audit: completed.data?.auditEntriesDeleted ?? null,
      }),
    );
    return reply(200, { deleted: true });
  } catch {
    console.error(JSON.stringify({ event: 'unexpected' }));
    return reply(500, { error: 'delete_failed' } satisfies PrivacyError);
  }
}
