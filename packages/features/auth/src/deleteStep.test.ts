import { describe, expect, it } from 'vitest';
import { afterReauth, deleteStep } from './deleteStep';

const reauth = { code: 'reauth_required' };
const empty = { blockingGroups: [] };
const base = { open: true, preview: undefined, previewError: null, removeError: null };

describe('deleteStep', () => {
  it('asks to sign in again when the preview answers reauth_required (QA8-2)', () => {
    expect(deleteStep({ ...base, previewError: reauth })).toBe('reauth');
    expect(afterReauth(null)).toBe('preview');
  });

  it('asks to sign in again when the deletion answers reauth_required, then deletes', () => {
    expect(deleteStep({ ...base, preview: empty, removeError: reauth })).toBe('reauth');
    expect(afterReauth(reauth)).toBe('delete');
  });

  it('shows the error for any other failed preview', () => {
    expect(deleteStep({ ...base, previewError: { code: 'network' } })).toBe('error');
    expect(deleteStep({ ...base, previewError: new Error('x') })).toBe('error');
  });

  it('walks closed, loading, blocking and confirm', () => {
    expect(deleteStep({ ...base, open: false, previewError: reauth })).toBe('closed');
    expect(deleteStep(base)).toBe('loading');
    expect(deleteStep({ ...base, preview: { blockingGroups: [{}] } })).toBe('blocking');
    expect(deleteStep({ ...base, preview: empty, removeError: { code: 'delete_failed' } })).toBe(
      'confirm',
    );
  });
});
