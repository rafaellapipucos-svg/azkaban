import { proofRules } from '@azkaban/config';
import {
  proofChallengeSchema,
  proofMetaHeader,
  proofResultSchema,
  proofReviewInputSchema,
  proofUploadMetaSchema,
  proofUrlSchema,
  taskProofSchema,
  type OccurrenceStatus,
  type ProofChallenge,
  type ProofResult,
  type ProofReviewInput,
  type ProofUploadMeta,
  type ProofUrl,
  type TaskProof,
  type TaskVisibility,
} from '@azkaban/contracts';
import { currentUserId, db, publicApiUrl } from '../client';
import { ProofError, failureOfResponse, failureOfRpc, reachableUrl } from './transport';

export { ProofError, proofFailureCode, type ProofFailureCode } from './transport';

/** A proof with what its reviewer needs from the occurrence and the task. */
export type ProofReviewItem = TaskProof & {
  occurrenceStatus: OccurrenceStatus;
  assigneeId: string;
  task: { title: string; groupId: string | null; visibility: TaskVisibility };
};

// `task_proofs` has grants by column: `select *` fails, and `storage_path` never leaves the server.
const proofColumns =
  'id, occurrence_id, user_id, sha256, size_bytes, width_px, height_px, captured_at_device, received_at, clock_delta_seconds, distance_m, accuracy_m, flags, platform, app_version, user_agent, review_status, reviewed_by, reviewed_at, review_note, superseded_at, photo_deleted_at';
// The named foreign key, because `task_occurrences.current_proof_id` links the two tables too.
const reviewColumns = `${proofColumns}, task_occurrences!task_proofs_occurrence_id_fkey!inner(status, assignee_id, tasks!inner(title, group_id, visibility))`;

type ReviewRow = {
  id: string;
  occurrence_id: string;
  user_id: string | null;
  sha256: string;
  size_bytes: number;
  width_px: number;
  height_px: number;
  captured_at_device: string;
  received_at: string;
  clock_delta_seconds: number;
  distance_m: number | null;
  accuracy_m: number | null;
  flags: string[];
  platform: string | null;
  app_version: string | null;
  user_agent: string | null;
  review_status: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_note: string | null;
  superseded_at: string | null;
  photo_deleted_at: string | null;
  task_occurrences: {
    status: OccurrenceStatus;
    assignee_id: string;
    tasks: { title: string; group_id: string | null; visibility: TaskVisibility };
  };
};

const toReviewItem = (row: ReviewRow): ProofReviewItem => ({
  ...taskProofSchema.parse({
    id: row.id,
    occurrenceId: row.occurrence_id,
    userId: row.user_id,
    sha256: row.sha256,
    sizeBytes: row.size_bytes,
    widthPx: row.width_px,
    heightPx: row.height_px,
    receivedAt: row.received_at,
    capturedAtDevice: row.captured_at_device,
    clockDeltaSeconds: row.clock_delta_seconds,
    distanceM: row.distance_m,
    accuracyM: row.accuracy_m,
    flags: row.flags,
    platform: row.platform,
    appVersion: row.app_version,
    userAgent: row.user_agent,
    reviewStatus: row.review_status,
    reviewedBy: row.reviewed_by,
    reviewedAt: row.reviewed_at,
    reviewNote: row.review_note,
    supersededAt: row.superseded_at,
    photoDeletedAt: row.photo_deleted_at,
  }),
  occurrenceStatus: row.task_occurrences.status,
  assigneeId: row.task_occurrences.assignee_id,
  task: {
    title: row.task_occurrences.tasks.title,
    groupId: row.task_occurrences.tasks.group_id,
    visibility: row.task_occurrences.tasks.visibility,
  },
});

const rpcFailure = (error: { message?: string; code?: string }) =>
  new ProofError(failureOfRpc(error), { cause: error });

/** `response` is missing when the request got no answer. */
async function functionFailure(error: unknown, response: Response | undefined) {
  if (!response) return new ProofError('network', { cause: error });
  const body: unknown = await response.json().catch(() => null);
  return new ProofError(failureOfResponse(response.status, body), { cause: error });
}

export const proofRepository = {
  /** Whether the user still has to accept the current notice. The server checks it too. */
  async consentPending(): Promise<boolean> {
    const { data, error } = await db()
      .from('profiles')
      .select('proof_consent_version')
      .eq('id', await currentUserId())
      .single();
    if (error) throw rpcFailure(error);
    return (data.proof_consent_version ?? 0) < proofRules.consentVersion;
  },

  async recordConsent(): Promise<void> {
    const { error } = await db().rpc('record_proof_consent', {
      p_version: proofRules.consentVersion,
    });
    if (error) throw rpcFailure(error);
  },

  async issueChallenge(occurrenceId: string): Promise<ProofChallenge> {
    const { data, error } = await db().rpc('issue_proof_challenge', {
      p_occurrence_id: occurrenceId,
    });
    if (error) throw rpcFailure(error);
    return proofChallengeSchema.parse(data);
  },

  /** `proof-validate`. Only its answer turns the task green: nothing here is optimistic. */
  async submit({
    bytes,
    meta,
  }: {
    bytes: Uint8Array;
    meta: ProofUploadMeta;
  }): Promise<ProofResult> {
    const { data, error, response } = await db().functions.invoke('proof-validate', {
      // A copy, because `bytes.buffer` may be wider than the photo.
      body: bytes.slice().buffer as ArrayBuffer,
      headers: {
        'Content-Type': proofRules.contentType,
        [proofMetaHeader]: encodeURIComponent(JSON.stringify(proofUploadMetaSchema.parse(meta))),
      },
    });
    if (error) throw await functionFailure(error, response);
    return proofResultSchema.parse(data);
  },

  /** What waits for an admin of the group, the oldest first. The author's own proofs are included. */
  async listReviewQueue(groupId: string): Promise<ProofReviewItem[]> {
    const { data, error } = await db()
      .from('task_proofs')
      .select(reviewColumns)
      .eq('review_status', 'in_review')
      .is('superseded_at', null)
      .eq('task_occurrences.tasks.group_id', groupId)
      .order('received_at')
      .limit(100);
    if (error) throw rpcFailure(error);
    return data.map(toReviewItem);
  },

  /** Null when the row policy hides it, so "not found" and "not allowed" look the same. */
  async get(proofId: string): Promise<ProofReviewItem | null> {
    const { data, error } = await db()
      .from('task_proofs')
      .select(reviewColumns)
      .eq('id', proofId)
      .maybeSingle();
    if (error) throw rpcFailure(error);
    return data && toReviewItem(data);
  },

  /** The occurrence's live proof, if the user is allowed to see it. */
  async currentId(occurrenceId: string): Promise<string | null> {
    const { data, error } = await db()
      .from('task_proofs')
      .select('id')
      .eq('occurrence_id', occurrenceId)
      .is('superseded_at', null)
      .maybeSingle();
    if (error) throw rpcFailure(error);
    return data?.id ?? null;
  },

  async review(input: ProofReviewInput): Promise<void> {
    const parsed = proofReviewInputSchema.parse(input);
    const { error } = await db().rpc('review_proof', {
      p_proof_id: parsed.proofId,
      p_decision: parsed.decision,
      // The generated types say non-null, but approving sends no status and may send no note.
      p_to_status: (parsed.decision === 'dispute' ? parsed.toStatus : null) as OccurrenceStatus,
      p_note: parsed.note as string,
    });
    if (error) throw rpcFailure(error);
  },

  /** Valid for a minute, so it is asked for each time the photo opens and never kept. */
  async signedUrl(proofId: string): Promise<ProofUrl> {
    const { data, error, response } = await db().functions.invoke('proof-url', {
      body: { proofId },
    });
    if (error) throw await functionFailure(error, response);
    const { url, expiresInSeconds } = proofUrlSchema.parse(data);
    return { url: reachableUrl(url, publicApiUrl()), expiresInSeconds };
  },
};
