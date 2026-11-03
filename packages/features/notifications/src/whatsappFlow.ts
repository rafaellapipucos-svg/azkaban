import { whatsappRules } from '@azkaban/config';
import { whatsappErrorCodeSchema, type WhatsAppStatus } from '@azkaban/contracts';
import { isWhatsAppReady, normalizePhone } from '@azkaban/core';
import { z } from 'zod';

const { allowedCountryCodes } = whatsappRules.verification;

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
