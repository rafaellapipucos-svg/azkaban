// Receives the photo of a proof and is the only writer of the `task-proofs` bucket (ADR-0007,
// sections 3 to 8). Every step is more expensive than the one before, so the cheap refusals come
// first and the nonce is spent before the body is read:
//   1 user  2 headers and metadata  3 claim the nonce  4 read the body in a stream  5 JPEG shape and size
//   6 hash  7 duplicate  8 location  9 clock  10 upload  11 commit_proof (or remove the object)
// The caller is the app, which can be hostile: nothing it sends is trusted beyond what is checked here.
import { proofDefaults, proofRules } from '@azkaban/config';
import {
  proofErrorCodeSchema,
  proofMetaHeader,
  proofResultSchema,
  proofUploadMetaSchema,
  type ProofErrorCode,
} from '@azkaban/contracts';
import { z } from 'zod';
import { responder, serviceClient, signedInUser } from '../_shared/http.ts';
import { readLimited } from './body.ts';
import { clockMismatch, inRange, inspectJpeg, judgeLocation, toHex } from './checks.ts';

const BUCKET = 'task-proofs';
const MAX_META_CHARS = 4096;
const MAX_USER_AGENT = 256;

const reply = responder([proofMetaHeader]);

const STATUS: Record<ProofErrorCode, number> = {
  forbidden: 403,
  proof_consent_required: 403,
  challenge_invalid: 409,
  challenge_used: 409,
  challenge_expired: 410,
  late_window_expired: 409,
  occurrence_not_open: 409,
  proof_not_required: 409,
  proof_disputed: 409,
  proof_superseded: 409,
  proof_already_reviewed: 409,
  proof_duplicate: 409,
  proof_photo_deleted: 410,
  proof_too_large: 413,
  proof_bad_type: 415,
  proof_bad_dimensions: 422,
  proof_hash_mismatch: 422,
  proof_out_of_radius: 422,
  challenge_rate_limited: 429,
};

/** What `claim_proof_challenge` returns (migration 171700). */
const claimSchema = z.object({
  occurrenceId: z.guid(),
  challengeCreatedAt: z.iso.datetime({ offset: true }),
  receivedAt: z.iso.datetime({ offset: true }),
  location: z.object({ lat: z.number(), lng: z.number(), radiusM: z.number() }).nullable(),
});

/** A refusal of the request. The log has the stage and the code, never the nonce, hash, path or place. */
function refuse(stage: string, code: ProofErrorCode) {
  console.error(JSON.stringify({ event: 'proof_refused', stage, code }));
  return reply(STATUS[code], { error: code });
}

/** The database answers with the contract code in `message`; anything else is the infrastructure. */
function databaseFailure(stage: string, error: { message?: string; code?: string }) {
  const known = proofErrorCodeSchema.safeParse(error.message);
  if (known.success) return refuse(stage, known.data);
  console.error(JSON.stringify({ event: 'proof_failed', stage, code: error.code }));
  return reply(500, { error: 'internal' });
}

/** True when the database answered with a SQLSTATE: the statement ran and was refused, so it rolled back. */
const definitive = (error: { code?: string }) => /^[0-9A-Z]{5}$/.test(error.code ?? '');

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return reply(204, null);
  if (req.method !== 'POST') return reply(405, { error: 'method_not_allowed' });
  const began = performance.now();

  try {
    const admin = serviceClient();

    // 1. Who. The gateway checks the signature; an anon or service key has no user and stops here.
    const user = await signedInUser(admin, req.headers.get('authorization') ?? '');
    if (!user) return reply(401, { error: 'unauthorized' });

    // 2. What was announced, before anything is spent. None of this consumes the nonce.
    const contentType = (req.headers.get('content-type') ?? '').split(';')[0]!.trim().toLowerCase();
    if (contentType !== proofRules.contentType) return refuse('headers', 'proof_bad_type');
    const announced = req.headers.get('content-length');
    if (announced !== null && Number(announced) > proofRules.maxBytes) {
      return refuse('headers', 'proof_too_large');
    }

    const header = req.headers.get(proofMetaHeader);
    let rawMeta: unknown;
    try {
      if (header === null || header.length > MAX_META_CHARS) throw new Error();
      rawMeta = JSON.parse(decodeURIComponent(header));
    } catch {
      console.error(
        JSON.stringify({ event: 'proof_refused', stage: 'meta', code: 'invalid_request' }),
      );
      return reply(400, { error: 'invalid_request' });
    }
    const parsedMeta = proofUploadMetaSchema.safeParse(rawMeta);
    if (!parsedMeta.success) {
      console.error(
        JSON.stringify({ event: 'proof_refused', stage: 'meta', code: 'invalid_request' }),
      );
      return reply(400, { error: 'invalid_request' });
    }
    const meta = parsedMeta.data;
    const nonce = meta.nonce.toLowerCase();

    // 3. The nonce is spent here, in one statement, so two requests with the same one have a single
    // winner. From this point on a failure needs another challenge.
    const claimed = await admin.rpc('claim_proof_challenge', {
      p_nonce: nonce,
      p_user_id: user.id,
    });
    if (claimed.error) return databaseFailure('claim', claimed.error);
    const claim = claimSchema.safeParse(claimed.data);
    if (!claim.success) {
      console.error(JSON.stringify({ event: 'proof_failed', stage: 'claim_shape' }));
      return reply(500, { error: 'internal' });
    }

    // 4. The body, counted as it arrives. Content-Length may be absent or false.
    const read = await readLimited(
      req.body,
      proofRules.maxBytes,
      proofDefaults.uploadTimeoutSeconds * 1000,
    );
    if (read.kind === 'too_large') return refuse('body', 'proof_too_large');
    if (read.kind === 'timeout') {
      console.error(
        JSON.stringify({ event: 'proof_refused', stage: 'body', code: 'upload_timeout' }),
      );
      return reply(408, { error: 'upload_timeout' });
    }
    if (read.kind === 'aborted') {
      console.error(
        JSON.stringify({ event: 'proof_refused', stage: 'body', code: 'invalid_request' }),
      );
      return reply(400, { error: 'invalid_request' });
    }
    const bytes = read.bytes;
    const readMs = performance.now() - began;

    // 5. The shape of the file and its size, read from the header.
    const jpeg = inspectJpeg(bytes);
    if (jpeg === 'bad_type') return refuse('bytes', 'proof_bad_type');
    if (
      !inRange(jpeg.widthPx, proofRules.minEdgePx, proofRules.maxEdgePx) ||
      !inRange(jpeg.heightPx, proofRules.minEdgePx, proofRules.maxEdgePx)
    ) {
      return refuse('bytes', 'proof_bad_dimensions');
    }

    // 6. The hash of what arrived. The client's is a check against corruption, never evidence.
    const hashBegan = performance.now();
    const sha256 = toHex(await crypto.subtle.digest('SHA-256', bytes));
    const hashMs = performance.now() - hashBegan;
    if (sha256 !== meta.sha256) return refuse('hash', 'proof_hash_mismatch');

    // 7. The same bytes again. The unique index is the real barrier; this only saves an upload.
    const seen = await admin.from('task_proofs').select('id').eq('sha256', sha256).limit(1);
    if (seen.error) return databaseFailure('duplicate', seen.error);
    if (seen.data.length > 0) return refuse('duplicate', 'proof_duplicate');

    // 8. Location. The coordinates stop here: only a distance and a precision go on.
    const place = judgeLocation(claim.data.location, meta.location, proofRules);
    if (place.blocked) return refuse('location', 'proof_out_of_radius');
    const flags: string[] = [...place.flags];

    // 9. The device clock against the server's own times.
    if (
      clockMismatch(
        Date.parse(meta.capturedAtDevice),
        Date.parse(claim.data.challengeCreatedAt),
        Date.parse(claim.data.receivedAt),
        proofRules.clockToleranceSeconds,
      )
    ) {
      flags.push('clock_mismatch');
    }

    // 10. The object. Nothing in the path comes from the client except the nonce, which the database
    // just matched to this occurrence and user. upsert: false, so nothing is ever overwritten.
    const path = `${claim.data.occurrenceId}/${nonce}.jpg`;
    const storage = admin.storage.from(BUCKET);
    const uploaded = await storage.upload(path, bytes, {
      contentType: proofRules.contentType,
      upsert: false,
    });
    if (uploaded.error) {
      // The upload may have landed even if the answer did not. Cleaning is idempotent.
      await storage.remove([path]).catch(() => {});
      console.error(JSON.stringify({ event: 'proof_failed', stage: 'upload' }));
      return reply(500, { error: 'internal' });
    }

    // 11. The commit. A refusal from the database rolled back, so the object is dropped. Anything
    // else (a lost connection) may have committed, and a row without its photo is worse than a photo
    // without a row: the object stays, and the retention job removes it if no row points to it.
    const committed = await admin.rpc('commit_proof', {
      p_nonce: nonce,
      p_user_id: user.id,
      p_storage_path: path,
      p_sha256: sha256,
      p_size_bytes: bytes.length,
      p_width_px: jpeg.widthPx,
      p_height_px: jpeg.heightPx,
      p_captured_at_device: meta.capturedAtDevice,
      p_distance_m: place.distanceM,
      p_accuracy_m: place.accuracyM,
      p_flags: flags,
      p_platform: meta.platform,
      p_app_version: meta.appVersion,
      p_user_agent: req.headers.get('user-agent')?.slice(0, MAX_USER_AGENT) || null,
    });
    if (committed.error) {
      if (definitive(committed.error)) {
        const removed = await storage.remove([path]);
        if (removed.error) console.error(JSON.stringify({ event: 'cleanup_failed' }));
      }
      return databaseFailure('commit', committed.error);
    }

    const result = proofResultSchema.safeParse(committed.data);
    if (!result.success) {
      // Committed: the object stays, since the row points to it.
      console.error(JSON.stringify({ event: 'proof_failed', stage: 'result_shape' }));
      return reply(500, { error: 'internal' });
    }

    // Heap plus buffers, in MiB. The runtime reports rss as 0, and process.cpuUsage() as 0 too, so
    // the CPU of the request is read as the synchronous parts: the hash here, the rest is I/O.
    const memory = Deno.memoryUsage();
    const memMb = Math.round((memory.heapUsed + memory.external) / 104857.6) / 10;
    console.log(
      JSON.stringify({
        event: 'proof_committed',
        bytes: bytes.length,
        flags: result.data.flags.length,
        readMs: Math.round(readMs),
        hashMs: Math.round(hashMs * 10) / 10,
        totalMs: Math.round(performance.now() - began),
        memMb,
      }),
    );
    return reply(200, result.data);
  } catch {
    console.error(JSON.stringify({ event: 'unexpected' }));
    return reply(500, { error: 'internal' });
  }
});
