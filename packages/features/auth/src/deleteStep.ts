/** What the "Excluir conta" section shows. */
export type DeleteStep = 'closed' | 'reauth' | 'error' | 'loading' | 'blocking' | 'confirm';

const needsReauth = (error: unknown) =>
  (error as { code?: unknown } | null | undefined)?.code === 'reauth_required';

/**
 * The step of the deletion section. `account-delete` asks a recent sign-in for the preview too
 * (ADR-0012, section 3), so a `reauth_required` from either call shows the sign-in form.
 */
export function deleteStep({
  open,
  preview,
  previewError,
  removeError,
}: {
  open: boolean;
  preview: { blockingGroups: readonly unknown[] } | undefined;
  previewError: unknown;
  removeError: unknown;
}): DeleteStep {
  if (!open) return 'closed';
  if (needsReauth(previewError) || needsReauth(removeError)) return 'reauth';
  if (previewError) return 'error';
  if (!preview) return 'loading';
  return preview.blockingGroups.length > 0 ? 'blocking' : 'confirm';
}

/**
 * After signing in again: the deletion that asked for it runs again; a preview that asked for it
 * is read again, never a deletion the person has not seen.
 */
export const afterReauth = (removeError: unknown): 'delete' | 'preview' =>
  needsReauth(removeError) ? 'delete' : 'preview';
