import type { ProofFailureCode } from '@azkaban/data';

/**
 * What the flow does after a failure, once it has reread the occurrence (ADR-0007, section 16).
 * - `keep_photo`: the photo may still be good, so it stays on screen and goes with a new challenge.
 * - `new_photo`: this photo is lost, so back to the camera with a new challenge.
 * - `consent`: the notice comes first.
 * - `stop`: back to the task, with the message.
 */
export type ProofRecovery = 'keep_photo' | 'new_photo' | 'consent' | 'stop';

export const proofRecovery: Record<ProofFailureCode, ProofRecovery> = {
  // The road failed, not the photo.
  network: 'keep_photo',
  internal: 'keep_photo',
  invalid_request: 'keep_photo',
  upload_timeout: 'keep_photo',

  proof_too_large: 'new_photo',
  proof_bad_type: 'new_photo',
  proof_bad_dimensions: 'new_photo',
  proof_hash_mismatch: 'new_photo',
  proof_duplicate: 'new_photo',
  proof_out_of_radius: 'new_photo',
  // A photo belongs to its challenge: once that is gone, so is the photo.
  challenge_invalid: 'new_photo',
  challenge_expired: 'new_photo',
  challenge_used: 'new_photo',

  proof_consent_required: 'consent',

  forbidden: 'stop',
  late_window_expired: 'stop',
  occurrence_not_open: 'stop',
  proof_not_required: 'stop',
  proof_disputed: 'stop',
  challenge_rate_limited: 'stop',
  proof_superseded: 'stop',
  proof_already_reviewed: 'stop',
  proof_photo_deleted: 'stop',
  unauthorized: 'stop',
  method_not_allowed: 'stop',
};
