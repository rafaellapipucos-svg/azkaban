// No imports: `pnpm db:check-permissions` loads this file directly in Node.

/**
 * Rules the server enforces (ADR-0007). Mirrored in public.app_settings under the key `proof_rules`,
 * so changing a value here needs a migration too. `maxBytes` and `contentType` are also the limits
 * of the `task-proofs` bucket.
 */
export const proofRules = {
  challengeTtlSeconds: 300,
  challengeMaxPerUserPerHour: 30,
  challengeMaxPerOccurrencePerHour: 10,
  /** Bounds the storage one account can fill, since a proof is kept until retention ends. */
  maxProofsPerUserPerDay: 30,
  maxBytes: 2_097_152,
  contentType: 'image/jpeg',
  /** Read from the JPEG header. Bounds what a reviewer's browser has to decode. */
  minEdgePx: 320,
  maxEdgePx: 2048,
  /** Device time outside [challenge issued, received] by more than this raises `clock_mismatch`. */
  clockToleranceSeconds: 120,
  /** `flag` keeps the proof and warns the reviewer. `block` refuses it. Section 7.6, item 6. */
  outOfRadius: 'flag',
  /** A reading worse than this counts as no reading. */
  maxLocationAccuracyM: 200,
  retentionDays: 90,
  /** How long a proof row outlives its photo. ADR-0007, section 20. */
  recordRetentionDays: 365,
  signedUrlTtlSeconds: 60,
  /** Raise it when the notice changes, so everyone reads the new text before the next proof. */
  consentVersion: 2,
} as const;

/** Client and function defaults, with nothing for the database to mirror. */
export const proofDefaults = {
  /** Applied before the stamp and the hash. */
  captureLongEdgePx: 1600,
  captureJpegQuality: 0.8,
  contextRadiusM: 200,
  /** The function stops reading a body after this, so a stalled upload cannot hold a worker. */
  uploadTimeoutSeconds: 30,
  /** Objects per run of `proof-retention`. Storage removes up to 1000 per request. */
  retentionBatchSize: 500,
} as const;
