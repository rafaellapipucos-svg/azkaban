import { whatsappRules } from '@azkaban/config';
import {
  instantSchema,
  phoneE164Schema,
  whatsappErrorCodeSchema,
  type PhoneVerificationError,
  type WhatsAppStatus,
} from '@azkaban/contracts';
import { isWhatsAppReady, normalizePhone } from '@azkaban/core';
import { z } from 'zod';

const { allowedCountryCodes, resendSeconds } = whatsappRules.verification;

/**
 * The number form. A country out of `allowedCountryCodes`, typed in its field or as `+` in the
 * number, is refused here, before a request; the database refuses it anyway (SEG5-5). The E.164
 * country codes are not prefixes of one another, so the start of the number is enough.
 */
export const phoneFormSchema = z
  .object({ country: z.string().regex(/^\d{1,3}$/), number: z.string() })
  .refine(({ number, country }) => normalizePhone(number, country) !== null, { path: ['number'] })
  .refine(
    ({ number, country }) => {
      const phone = normalizePhone(number, country);
      return !phone || allowedCountryCodes.some((code) => phone.startsWith(`+${code}`));
    },
    { path: ['country'] },
  );
export type PhoneForm = z.infer<typeof phoneFormSchema>;

/** What the WhatsApp section shows: the number, the code, the notice, or the summary settings. */
export type WhatsAppStep = 'phone' | 'code' | 'consent' | 'on';

/**
 * A verified number always wins over a code still on screen. Ready, but under an older notice than
 * `consentVersion`, asks for the new one (ADR-0009, section 4).
 */
export function whatsappStep(
  status: WhatsAppStatus,
  codeSent: boolean,
  consentVersion: number,
): WhatsAppStep {
  if (!status.phoneVerifiedAt) return codeSent ? 'code' : 'phone';
  if (!isWhatsAppReady(status) || (status.optInVersion ?? 0) < consentVersion) return 'consent';
  return 'on';
}

/** Whole seconds until `instant`, never negative. A missing instant is no wait. */
export function secondsUntil(instant: string | null, now: number): number {
  if (!instant) return 0;
  return Math.max(0, Math.ceil((Date.parse(instant) - now) / 1000));
}

/** A wait in the largest unit that reads well, rounded up: 90 s is "2 minutos", 2 h 1 min is "3 horas". */
export function waitParts(seconds: number): {
  unit: 'seconds' | 'minutes' | 'hours';
  count: number;
} {
  if (seconds < 60) return { unit: 'seconds', count: seconds };
  if (seconds < 3600) return { unit: 'minutes', count: Math.ceil(seconds / 60) };
  return { unit: 'hours', count: Math.ceil(seconds / 3600) };
}

/**
 * The i18n key of a failure: a code of the contract, as a string (an answer of the function or of
 * the RPC) or as the message of a raised RPC error. Anything else is the generic one.
 */
export function whatsappErrorKey(failure: unknown): string {
  const raw =
    typeof failure === 'string'
      ? failure
      : typeof failure === 'object' && failure !== null && 'message' in failure
        ? failure.message
        : null;
  const code = whatsappErrorCodeSchema.safeParse(raw);
  return `whatsapp.errors.${code.success ? code.data : 'generic'}`;
}

/**
 * The key of the sent code in the tab's session (QA5-1): back from WhatsApp, the browser often reloads
 * the tab, and the code step must still be there. Only the number the code went to and its times;
 * never the code.
 */
export const pendingCodeKey = 'azkaban.whatsapp.pendingCode';

const pendingCodeSchema = z.object({
  userId: z.string().min(1),
  phone: phoneE164Schema,
  expiresAt: instantSchema,
  resendAt: instantSchema,
});
export type PendingCode = z.infer<typeof pendingCodeSchema>;

/** The kept code of this user while it is alive, or null (another user, dead, or not ours). */
export function readPendingCode(raw: string | null, userId: string, now: number) {
  if (!raw || !userId) return null;
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  const pending = pendingCodeSchema.safeParse(value);
  if (!pending.success || pending.data.userId !== userId) return null;
  return Date.parse(pending.data.expiresAt) > now ? pending.data : null;
}

/**
 * The i18n key of a refused request. `phone_rate_limited` within `resendSeconds` is the wait between
 * two codes, not too many codes (QA5-2); the countdown under it says how long.
 */
export function requestRefusalKey({ error, retryAfterSeconds }: PhoneVerificationError): string {
  if (error === 'phone_rate_limited' && (retryAfterSeconds ?? Infinity) <= resendSeconds)
    return 'whatsapp.errors.phone_resend_wait';
  return whatsappErrorKey(error);
}
