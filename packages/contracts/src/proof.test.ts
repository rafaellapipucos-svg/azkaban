import { describe, expect, it } from 'vitest';
import { contextLocationSchema } from './contexts';
import { proofReviewInputSchema, proofUploadMetaSchema } from './proof';
import { taskInputSchema } from './tasks';

const id = '11111111-1111-4111-8111-111111111111';

describe('proofUploadMetaSchema', () => {
  const meta = {
    nonce: id,
    sha256: 'a'.repeat(64),
    capturedAtDevice: '2026-11-02T12:00:00+00:00',
    location: null,
    platform: 'web',
    appVersion: '1.0.0',
  };

  it('accepts lowercase hex and refuses anything else as a hash', () => {
    expect(proofUploadMetaSchema.safeParse(meta).success).toBe(true);
    expect(proofUploadMetaSchema.safeParse({ ...meta, sha256: 'A'.repeat(64) }).success).toBe(
      false,
    );
    expect(proofUploadMetaSchema.safeParse({ ...meta, sha256: 'a'.repeat(63) }).success).toBe(
      false,
    );
  });

  it('refuses coordinates that do not exist', () => {
    const location = { lat: 91, lng: 0, accuracyM: 10 };
    expect(proofUploadMetaSchema.safeParse({ ...meta, location }).success).toBe(false);
  });
});

describe('proofReviewInputSchema', () => {
  it('needs a reason and a destination to dispute', () => {
    const dispute = { proofId: id, decision: 'dispute', toStatus: 'partial', note: 'Foto errada' };
    expect(proofReviewInputSchema.safeParse(dispute).success).toBe(true);
    expect(proofReviewInputSchema.safeParse({ ...dispute, note: '  ' }).success).toBe(false);
    expect(proofReviewInputSchema.safeParse({ ...dispute, toStatus: 'done' }).success).toBe(false);
  });

  it('approves with no note', () => {
    const approve = { proofId: id, decision: 'approve', note: null };
    expect(proofReviewInputSchema.safeParse(approve).success).toBe(true);
  });
});

describe('requiresAdminApproval', () => {
  const task = {
    title: 'Fechar a loja',
    notes: null,
    contextId: id,
    assigneeId: id,
    scheduleType: 'timed',
    startAt: '2026-11-02T12:00:00+00:00',
    dueAt: null,
    durationMin: 60,
    timezone: 'America/Sao_Paulo',
    reminders: [],
    requiresPhotoProof: true,
    requiresAdminApproval: true,
    requiresPartialReason: true,
    difficulty: 'easy',
    priority: 'normal',
    visibility: 'group',
    recurrence: null,
  };

  it('needs a photo to review and a reviewer who can see it', () => {
    expect(taskInputSchema.safeParse(task).success).toBe(true);
    expect(taskInputSchema.safeParse({ ...task, requiresPhotoProof: false }).success).toBe(false);
    expect(taskInputSchema.safeParse({ ...task, visibility: 'private' }).success).toBe(false);
  });
});

describe('contextLocationSchema', () => {
  const location = { address: 'Rua A, 10', lat: -8.05, lng: -34.9, radiusM: 200 };

  it('bounds the radius', () => {
    expect(contextLocationSchema.safeParse(location).success).toBe(true);
    expect(contextLocationSchema.safeParse({ ...location, radiusM: 5 }).success).toBe(false);
    expect(contextLocationSchema.safeParse({ ...location, radiusM: 100_000 }).success).toBe(false);
  });
});
