import {
  privacyErrorSchema,
  type AccountDeletePreview,
  type PrivacyErrorCode,
} from '@azkaban/contracts';

/**
 * What the screen can tell apart: the contract's codes (ADR-0012, sections 2 and 3), `unauthorized`
 * for a gateway refusal without a body of ours, `network` for no answer at all, and `internal` for
 * anything else.
 */
export type PrivacyFailureCode = PrivacyErrorCode | 'unauthorized' | 'network' | 'internal';

export class PrivacyError extends Error {
  constructor(
    readonly code: PrivacyFailureCode,
    readonly details: { retryAfterSeconds?: number; preview?: AccountDeletePreview } = {},
    options?: { cause?: unknown },
  ) {
    super(code, options);
    this.name = 'PrivacyError';
  }
}

/** A failed response of `account-export` or `account-delete`. Never trusts a body outside the contract. */
export function privacyFailure(status: number | null, body: unknown, cause?: unknown) {
  if (status === null) return new PrivacyError('network', {}, { cause });
  const parsed = privacyErrorSchema.safeParse(body);
  if (parsed.success) {
    const { error, retryAfterSeconds, preview } = parsed.data;
    return new PrivacyError(error, { retryAfterSeconds, preview }, { cause });
  }
  return new PrivacyError(status === 401 ? 'unauthorized' : 'internal', {}, { cause });
}

/**
 * The wait of `rate_limited`, rounded up so the person never comes back too early: hours from one
 * hour on, else minutes (at least one). Without a number, a minute.
 */
export function retryWait(seconds = 60): { unit: 'hours' | 'minutes'; count: number } {
  return seconds >= 3600
    ? { unit: 'hours', count: Math.ceil(seconds / 3600) }
    : { unit: 'minutes', count: Math.max(1, Math.ceil(seconds / 60)) };
}

/** `azkaban-dados-AAAA-MM-DD.json`, by the device's calendar day (ADR-0012, section 2). */
export function exportFileName(now: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `azkaban-dados-${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}.json`;
}
