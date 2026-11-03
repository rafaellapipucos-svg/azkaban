import { callFailure } from '@azkaban/data';

/**
 * The text of a failed auth call, in the `auth` namespace: its own over GoTrue's limit (429),
 * offline or with the server down; `fallback` for the rest, like wrong credentials.
 */
export function failureKey(error: unknown, fallback: string) {
  const code = callFailure(error);
  return code ? `errors.${code}` : fallback;
}
