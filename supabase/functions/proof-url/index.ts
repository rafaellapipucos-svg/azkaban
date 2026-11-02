// Hands out a short-lived signed URL for the photo of a proof (ADR-0007, section 12). The client never
// creates one: with a SELECT policy on the bucket a hostile client would pick its own lifetime. The
// rule of who may see a photo is the database's (`can_view_proof`, as the row policy of task_proofs):
// this function reads the row with the user's own JWT, and only if the row comes back does the service
// role sign. The URL works for anyone who holds it until it expires, hence the short life.
import { proofDefaults, proofRules } from '@azkaban/config';
import { proofUrlInputSchema, proofUrlSchema, type ProofErrorCode } from '@azkaban/contracts';
import { createClient } from '@supabase/supabase-js';
import { clientOptions, responder, serviceClient, signedInUser } from '../_shared/http.ts';
import { readLimited } from '../_shared/body.ts';

const BUCKET = 'task-proofs';
const MAX_BODY_BYTES = 1024;

const reply = responder();

function refuse(stage: string, status: number, code: ProofErrorCode) {
  console.error(JSON.stringify({ event: 'proof_url_refused', stage, code }));
  return reply(status, { error: code });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return reply(204, null);
  if (req.method !== 'POST') return reply(405, { error: 'method_not_allowed' });

  try {
    const admin = serviceClient();
    const authorization = req.headers.get('authorization') ?? '';
    const user = await signedInUser(admin, authorization);
    if (!user) return reply(401, { error: 'unauthorized' });

    // The input is one id: the read stops at the limit, so a huge body never reaches the memory.
    const read = await readLimited(
      req.body,
      MAX_BODY_BYTES,
      proofDefaults.uploadTimeoutSeconds * 1000,
    );
    if (read.kind !== 'ok') return reply(400, { error: 'invalid_request' });
    let raw: unknown;
    try {
      raw = JSON.parse(new TextDecoder().decode(read.bytes));
    } catch {
      return reply(400, { error: 'invalid_request' });
    }
    const input = proofUrlInputSchema.safeParse(raw);
    if (!input.success) return reply(400, { error: 'invalid_request' });
    const { proofId } = input.data;

    // As the user: the row policy decides. `id` and `photo_deleted_at` are among the columns the
    // user may read; `storage_path` is not. No row means no right to see, or no such proof.
    const asUser = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
      ...clientOptions,
      global: { headers: { Authorization: authorization } },
    });
    const visible = await asUser
      .from('task_proofs')
      .select('id, photo_deleted_at')
      .eq('id', proofId)
      .maybeSingle();
    if (visible.error) {
      console.error(
        JSON.stringify({ event: 'proof_url_failed', stage: 'read', code: visible.error.code }),
      );
      return reply(500, { error: 'internal' });
    }
    if (!visible.data) return refuse('read', 403, 'forbidden');
    if (visible.data.photo_deleted_at) return refuse('read', 410, 'proof_photo_deleted');

    const row = await admin.from('task_proofs').select('storage_path').eq('id', proofId).single();
    if (row.error) {
      console.error(
        JSON.stringify({ event: 'proof_url_failed', stage: 'path', code: row.error.code }),
      );
      return reply(500, { error: 'internal' });
    }
    // Retention clears the path after it removes the object.
    if (!row.data.storage_path) return refuse('path', 410, 'proof_photo_deleted');

    const signed = await admin.storage
      .from(BUCKET)
      .createSignedUrl(row.data.storage_path, proofRules.signedUrlTtlSeconds);
    if (signed.error) {
      // Retention removes the object before it marks the row, and a request can land in between.
      if (/not found/i.test(signed.error.message))
        return refuse('sign', 410, 'proof_photo_deleted');
      console.error(JSON.stringify({ event: 'proof_url_failed', stage: 'sign' }));
      return reply(500, { error: 'internal' });
    }

    const body = proofUrlSchema.safeParse({
      url: signed.data.signedUrl,
      expiresInSeconds: proofRules.signedUrlTtlSeconds,
    });
    if (!body.success) {
      console.error(JSON.stringify({ event: 'proof_url_failed', stage: 'shape' }));
      return reply(500, { error: 'internal' });
    }
    // Never the URL or the path in a log.
    console.log(JSON.stringify({ event: 'proof_url_signed' }));
    return reply(200, body.data);
  } catch {
    console.error(JSON.stringify({ event: 'unexpected' }));
    return reply(500, { error: 'internal' });
  }
});
