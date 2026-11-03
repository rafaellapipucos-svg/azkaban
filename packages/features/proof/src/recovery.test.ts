import { proofErrorCodeSchema } from '@azkaban/contracts';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { proofRecovery } from './recovery';

const packages = join(import.meta.dirname, '..', '..', '..');
const messages = JSON.parse(
  readFileSync(join(packages, 'i18n', 'src', 'pt-BR', 'proof.json'), 'utf8'),
) as {
  errors: Record<string, string>;
  photo: Record<string, string>;
  camera: { reason: Record<string, string> };
};

describe('proofRecovery', () => {
  it('keeps the photo when only the road failed', () => {
    for (const code of ['network', 'internal', 'invalid_request', 'upload_timeout'] as const) {
      expect(proofRecovery[code]).toBe('keep_photo');
    }
  });

  it('asks for another photo once this one cannot count', () => {
    for (const code of [
      'challenge_expired',
      'challenge_used',
      'challenge_invalid',
      'proof_duplicate',
      'proof_hash_mismatch',
      'proof_bad_type',
    ] as const) {
      expect(proofRecovery[code]).toBe('new_photo');
    }
  });

  it('goes back to the task, or to the notice, when another photo would not help', () => {
    expect(proofRecovery.challenge_rate_limited).toBe('stop');
    expect(proofRecovery.forbidden).toBe('stop');
    expect(proofRecovery.unauthorized).toBe('stop');
    expect(proofRecovery.proof_consent_required).toBe('consent');
  });
});

describe('messages', () => {
  it('has one for every code of the contract and of the transport', () => {
    for (const code of proofErrorCodeSchema.options) expect(proofRecovery).toHaveProperty(code);
    for (const code of Object.keys(proofRecovery)) expect(messages.errors[code]).toBeTruthy();
  });

  it('has one for every photo error and every reason the camera gives', () => {
    for (const code of ['not_ready', 'too_small', 'too_large', 'encode_failed']) {
      expect(messages.photo[code]).toBeTruthy();
    }
    for (const reason of ['no_device', 'in_use', 'insecure_context', 'unsupported', 'error']) {
      expect(messages.camera.reason[reason]).toBeTruthy();
    }
  });
});

describe('the flow takes photos only from the camera', () => {
  it('has no file input and no gallery or file picker', () => {
    const forbidden =
      /type=["']file["']|image-picker|document-picker|launchImageLibrary|launchCamera|showOpenFilePicker|MediaLibrary|media-library/;
    const dirs = [join(packages, 'features', 'proof', 'src'), join(packages, 'platform', 'src')];
    const sources = dirs.flatMap((dir) =>
      readdirSync(dir)
        .filter((file) => /\.tsx?$/.test(file) && !file.endsWith('.test.ts'))
        .map((file) => join(dir, file)),
    );
    expect(sources.length).toBeGreaterThan(5);
    for (const file of sources) expect(readFileSync(file, 'utf8')).not.toMatch(forbidden);
  });
});
