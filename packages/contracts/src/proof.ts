import { z } from 'zod';
import { idSchema, instantSchema } from './common';
import { proofReviewStatusSchema } from './tasks';

/** Header of `proof-validate`: the body is the JPEG, and this is its metadata. See ADR-0007. */
export const proofMetaHeader = 'x-proof-meta';

export const sha256HexSchema = z.string().regex(/^[0-9a-f]{64}$/);

/** Argument of the `issue_proof_challenge` RPC. */
export const proofChallengeInputSchema = z.object({ occurrenceId: idSchema });
export type ProofChallengeInput = z.infer<typeof proofChallengeInputSchema>;

export const proofChallengeSchema = z.object({
  /** Single use, bound to the user and the occurrence. It is the only right to upload. */
  nonce: idSchema,
  /** A duration, not an instant, so a wrong device clock cannot misread it. */
  expiresInSeconds: z.int().positive(),
  /** Whether the context has a location, the only case in which the app asks for one. */
  checkLocation: z.boolean(),
});
export type ProofChallenge = z.infer<typeof proofChallengeSchema>;

/** Claimed by the client. The server keeps only the distance, never the coordinates. */
export const proofLocationSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  accuracyM: z.number().positive().max(100_000),
});
export type ProofLocation = z.infer<typeof proofLocationSchema>;

export const proofPlatformSchema = z.enum(['web', 'ios', 'android']);
export type ProofPlatform = z.infer<typeof proofPlatformSchema>;

/** Sent as `encodeURIComponent(JSON.stringify(meta))` in `proofMetaHeader`. All of it is a claim. */
export const proofUploadMetaSchema = z.object({
  nonce: idSchema,
  sha256: sha256HexSchema,
  capturedAtDevice: instantSchema,
  /** Null when the context has none, or when the user refused or the device could not read it. */
  location: proofLocationSchema.nullable(),
  platform: proofPlatformSchema,
  /** Printable ASCII: a NUL would pass as text and only fail in Postgres, after the nonce is spent. */
  appVersion: z
    .string()
    .trim()
    .min(1)
    .max(40)
    .regex(/^[\x20-\x7e]+$/),
});
export type ProofUploadMeta = z.infer<typeof proofUploadMetaSchema>;

/** Warnings for the reviewer. None of them blocks, except out of radius under `block`. */
export const proofFlagSchema = z.enum(['out_of_radius', 'location_missing', 'clock_mismatch']);
export type ProofFlag = z.infer<typeof proofFlagSchema>;

/** Successful response of `proof-validate`. */
export const proofResultSchema = z.object({
  proofId: idSchema,
  occurrenceId: idSchema,
  status: z.literal('done'),
  reviewStatus: proofReviewStatusSchema,
  /** The official time, from the server. */
  receivedAt: instantSchema,
  late: z.boolean(),
  flags: z.array(proofFlagSchema),
});
export type ProofResult = z.infer<typeof proofResultSchema>;

/** What the author and whoever has `proof.review` read. The bytes need a `proof-url` call. */
export const taskProofSchema = z.object({
  id: idSchema,
  occurrenceId: idSchema,
  /** Null after the account is deleted. */
  userId: idSchema.nullable(),
  /** Computed by the server from the stored bytes. */
  sha256: sha256HexSchema,
  sizeBytes: z.int().positive(),
  widthPx: z.int().positive(),
  heightPx: z.int().positive(),
  receivedAt: instantSchema,
  capturedAtDevice: instantSchema,
  /** `receivedAt` minus `capturedAtDevice`. */
  clockDeltaSeconds: z.int(),
  /** Distance from the context, when there was a usable reading. */
  distanceM: z.int().min(0).nullable(),
  accuracyM: z.int().min(0).nullable(),
  flags: z.array(proofFlagSchema),
  platform: proofPlatformSchema.nullable(),
  appVersion: z.string().nullable(),
  userAgent: z.string().nullable(),
  reviewStatus: proofReviewStatusSchema,
  /** Null also when the retention job approved it. */
  reviewedBy: idSchema.nullable(),
  reviewedAt: instantSchema.nullable(),
  reviewNote: z.string().nullable(),
  /** Set when the occurrence is reopened. It no longer counts for anything. */
  supersededAt: instantSchema.nullable(),
  /** Set when retention removes the photo. The row stays as the audit trail. */
  photoDeletedAt: instantSchema.nullable(),
});
export type TaskProof = z.infer<typeof taskProofSchema>;

/** Argument of the `review_proof` RPC. A dispute always says why, and the assignee reads it. */
export const proofReviewInputSchema = z.discriminatedUnion('decision', [
  z.object({
    proofId: idSchema,
    decision: z.literal('approve'),
    note: z.string().trim().min(1).max(500).nullable(),
  }),
  z.object({
    proofId: idSchema,
    decision: z.literal('dispute'),
    toStatus: z.enum(['partial', 'missed']),
    note: z.string().trim().min(1).max(500),
  }),
]);
export type ProofReviewInput = z.infer<typeof proofReviewInputSchema>;

/** Body of `proof-url`. */
export const proofUrlInputSchema = z.object({ proofId: idSchema });
export type ProofUrlInput = z.infer<typeof proofUrlInputSchema>;

export const proofUrlSchema = z.object({
  url: z.url(),
  expiresInSeconds: z.int().positive(),
});
export type ProofUrl = z.infer<typeof proofUrlSchema>;

/**
 * Raised by the proof RPCs and returned as `{ error }` by the proof functions, which the UI maps to
 * i18n keys. `forbidden` and `late_window_expired` mean the same as in `taskErrorCodeSchema`.
 * Only what has its own message belongs here: any other value is a generic failure. See ADR-0007.
 */
export const proofErrorCodeSchema = z.enum([
  'forbidden',
  'late_window_expired',
  'occurrence_not_open',
  'proof_not_required',
  'proof_consent_required',
  'proof_disputed',
  'challenge_rate_limited',
  'challenge_invalid',
  'challenge_expired',
  'challenge_used',
  'upload_timeout',
  'proof_too_large',
  'proof_bad_type',
  'proof_bad_dimensions',
  'proof_hash_mismatch',
  'proof_duplicate',
  'proof_out_of_radius',
  'proof_superseded',
  'proof_already_reviewed',
  'proof_photo_deleted',
]);
export type ProofErrorCode = z.infer<typeof proofErrorCodeSchema>;
