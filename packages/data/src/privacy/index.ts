import {
  accountDeletePreviewSchema,
  accountDeleteResultSchema,
  type AccountDeletePreview,
  type AccountDeleteRequest,
} from '@azkaban/contracts';
import { currentUserId, db } from '../client';
import { exportFileName, privacyFailure } from './transport';

export { PrivacyError, retryWait, type PrivacyFailureCode } from './transport';

/** `response` is missing when the request got no answer. */
async function functionFailure(error: unknown, response: Response | undefined) {
  if (!response) return privacyFailure(null, null, error);
  const body: unknown = await response.json().catch(() => null);
  return privacyFailure(response.status, body, error);
}

async function deleteAccount(request: AccountDeleteRequest) {
  const { data, error, response } = await db().functions.invoke('account-delete', {
    body: request,
  });
  if (error) throw await functionFailure(error, response);
  return data as unknown;
}

/** Export, deletion and consent of the signed-in account (ADR-0012, sections 2, 3 and 6). */
export const privacyRepository = {
  /** The whole `account-export` answer, as the text of the file to save. Nothing is kept here. */
  async exportData(): Promise<{ fileName: string; text: string }> {
    const { data, error, response } = await db().functions.invoke('account-export');
    if (error) throw await functionFailure(error, response);
    // ponytail: not parsed against accountExportSchema, so a section the client does not know yet
    // still reaches the person; the function owns the shape.
    const text = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
    return { fileName: exportFileName(new Date()), text };
  },

  /** What deleting would do now: owned groups that block it and the ones that go with it. */
  async deletionPreview(): Promise<AccountDeletePreview> {
    return accountDeletePreviewSchema.parse(await deleteAccount({ dryRun: true }));
  },

  /** Deletes the account for good. `owns_groups` carries a fresh preview; `reauth_required` asks a sign-in. */
  async deleteAccount(): Promise<void> {
    accountDeleteResultSchema.parse(await deleteAccount({ dryRun: false }));
  },

  /** When the photo proof notice was accepted, or null without a live acceptance. */
  async proofConsent(): Promise<{ version: number; acceptedAt: string } | null> {
    const { data, error } = await db()
      .from('profiles')
      .select('proof_consent_version, proof_consent_at')
      .eq('id', await currentUserId())
      .single();
    if (error) throw error;
    return data.proof_consent_version && data.proof_consent_at
      ? { version: data.proof_consent_version, acceptedAt: data.proof_consent_at }
      : null;
  },

  /** Marks the live acceptance revoked. The photos already sent keep their retention. */
  async revokeProofConsent(): Promise<void> {
    const { error } = await db().rpc('revoke_proof_consent');
    if (error) throw error;
  },
};
