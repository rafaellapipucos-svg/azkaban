import { rateLimitedErrorCode } from '@azkaban/contracts';

/** A failure the screens have their own words for: over a limit, no connection, the server down. */
export const callFailureCodes = [rateLimitedErrorCode, 'network', 'unavailable'] as const;
export type CallFailure = (typeof callFailureCodes)[number];

/**
 * Names the failure by the HTTP status the call came back with. PostgREST and GoTrue both give 0
 * for a fetch that never reached the server, and PostgREST answers PT429 with 429. The result is an
 * `Error` whose message is the code and whose cause is the original, which `isTransientFailure`
 * still reads; any other failure comes back untouched.
 */
export function withCallFailure<E extends Error>(error: E, status: number | undefined): E | Error {
  const code =
    (error as { code?: unknown }).code === 'PT429' || status === 429
      ? rateLimitedErrorCode
      : status === 0
        ? 'network'
        : status !== undefined && status >= 500
          ? 'unavailable'
          : null;
  return code ? new Error(code, { cause: error }) : error;
}

/** The code `withCallFailure` named, or null: the screen shows its own text for the rest. */
export function callFailure(error: unknown): CallFailure | null {
  const message = error instanceof Error ? error.message : null;
  return callFailureCodes.find((code) => code === message) ?? null;
}
