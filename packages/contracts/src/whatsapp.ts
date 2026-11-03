import { z } from 'zod';
import { idSchema, instantSchema, localDateSchema, timezoneSchema } from './common';
import { localTimeSchema } from './notifications';
import { scheduleTypeSchema } from './tasks';

// WhatsApp (ADR-0009): a verified phone, an explicit opt-in, the daily summary, the provider and the
// webhook. The phone and every text here are personal data: never in a log.

/**
 * E.164, already normalized by the client: `+`, a country code that does not start with 0, and 8 to
 * 15 digits in all. The database has the same check. Spaces, dashes and parentheses are the UI's job.
 */
export const phoneE164Schema = z.string().regex(/^\+[1-9]\d{7,14}$/);

/**
 * The code typed by the user. The length the server makes is `whatsappRules.verification.codeLength`;
 * the contract only bounds the shape, and a wrong length is simply a wrong code.
 */
export const phoneCodeSchema = z.string().regex(/^\d{4,10}$/);

/** Body of `POST /functions/v1/phone-verification`. */
export const phoneVerificationRequestSchema = z.object({ phone: phoneE164Schema });
export type PhoneVerificationRequest = z.infer<typeof phoneVerificationRequestSchema>;

/** Answer 200 of the same function: when the code dies and when another one may be asked for. */
export const phoneVerificationStartedSchema = z.object({
  expiresAt: instantSchema,
  resendAt: instantSchema,
});
export type PhoneVerificationStarted = z.infer<typeof phoneVerificationStartedSchema>;

/** Argument of the `confirm_phone_verification` RPC. */
export const phoneVerificationConfirmSchema = z.object({ code: phoneCodeSchema });
export type PhoneVerificationConfirm = z.infer<typeof phoneVerificationConfirmSchema>;

/**
 * What `confirm_phone_verification` returns. A wrong code is an answer, not an exception: an exception
 * would roll back the count of tries, and the code could be guessed without limit.
 */
export const phoneVerificationConfirmResultSchema = z.union([
  z.object({ phoneE164: phoneE164Schema, verifiedAt: instantSchema }),
  z.object({ error: z.enum(['phone_code_invalid', 'phone_code_expired']) }),
]);
export type PhoneVerificationConfirmResult = z.infer<typeof phoneVerificationConfirmResultSchema>;

/** Argument of the `whatsapp_opt_in` RPC: the version of the notice the user read and accepted. */
export const whatsappOptInSchema = z.object({ consentVersion: z.int().min(1) });
export type WhatsAppOptIn = z.infer<typeof whatsappOptInSchema>;

/**
 * What the user reads of their own WhatsApp state, from `profiles`. Ready to receive means verified,
 * and an opt-in newer than the last opt-out.
 */
export const whatsappStatusSchema = z.object({
  phoneE164: phoneE164Schema.nullable(),
  phoneVerifiedAt: instantSchema.nullable(),
  optInAt: instantSchema.nullable(),
  optInVersion: z.int().min(1).nullable(),
  optOutAt: instantSchema.nullable(),
});
export type WhatsAppStatus = z.infer<typeof whatsappStatusSchema>;

/** The `daily_summary_*` columns of `profiles` the user writes. Bounds mirrored by `check`s. */
export const dailySummaryPreferencesSchema = z.object({
  enabled: z.boolean(),
  /** Local time of the profile. */
  time: localTimeSchema,
  includeOverdue: z.boolean(),
  /** Deadlines due within this many days after today. `whatsappRules.dailySummary.maxDeadlineDays`. */
  deadlineDays: z.int().min(0).max(30),
  /** A day with nothing to tell sends nothing, or a short message. */
  skipEmpty: z.boolean(),
});
export type DailySummaryPreferences = z.infer<typeof dailySummaryPreferencesSchema>;

// `dailySummaryNotificationDataSchema`, the `data` of the `daily_summary` row, is in `./notifications`.

/** One occurrence in the summary. Read through the same access as the bell, at send time. */
export const dailySummaryTaskSchema = z.object({
  occurrenceId: idSchema,
  title: z.string(),
  /** `areas.i18n_key`, to group by area in the user's language. */
  areaI18nKey: z.string(),
  contextName: z.string(),
  scheduleType: scheduleTypeSchema,
  startAt: instantSchema,
  /** `scheduled_due`, set for `deadline`. */
  dueAt: instantSchema.nullable(),
});
export type DailySummaryTask = z.infer<typeof dailySummaryTaskSchema>;

const count = z.int().min(0);

/**
 * What `claim_notification_batch` returns in `summary` for a `daily_summary` row, and the input of the
 * pure function in `packages/core/src/notifications`. The lists are cut by
 * `whatsappRules.dailySummary.maxItems`; `totals` has the full counts, for "+3 more".
 */
export const dailySummarySourceSchema = z.object({
  localDate: localDateSchema,
  timezone: timezoneSchema,
  /** Pending today, in order of start. */
  today: z.array(dailySummaryTaskSchema).max(50),
  /** Null when the user turned overdue off. */
  overdue: z.array(dailySummaryTaskSchema).max(50).nullable(),
  /** `deadline` tasks due after today and within `deadlineDays`, nearest first. */
  deadlines: z.array(dailySummaryTaskSchema).max(50),
  deadlineDays: z.int().min(0).max(30),
  totals: z.object({ today: count, overdue: count, deadlines: count }),
  /**
   * Null until Phase 6 creates `user_stats` (ADR-0010, section 9). `current` is
   * `user_stats.current_streak`; `goalToday` is how many occurrences meet today's goal, null when
   * nothing is planned today.
   */
  streak: z.object({ current: count, goalToday: count.nullable() }).nullable(),
});
export type DailySummarySource = z.infer<typeof dailySummarySourceSchema>;

/**
 * A template parameter. Meta refuses a parameter with a line break or a tab, or with more than four
 * spaces in a row (ADR-0009, section 5), so the template keeps the line breaks and each parameter is
 * one line. `\p{Cc}` covers LF, CR, tab and every other control character; U+2028 and U+2029 are
 * line breaks too. The bidirectional controls (U+202A to U+202E, U+2066 to U+2069) would let a title
 * written by someone else reverse what the reader sees, in a message from our number (ADR-0009,
 * section 18, SEG5-6).
 */
export const whatsappTextParamSchema = z
  .string()
  .max(1024)
  .regex(/^(?!.* {5})(?=.*\S)[^\p{Cc}\u2028\u2029\u202a-\u202e\u2066-\u2069]+$/u);

/**
 * Output of the pure function: the named parameters of `whatsappDefaults.templates.dailySummary`.
 * Each one fits its budget in `whatsappDefaults.summaryBudgets`, so the body stays under Meta's 1024.
 */
export const dailySummaryRenderSchema = z.object({
  /** "segunda, 3 de nov." */
  date: whatsappTextParamSchema,
  today: whatsappTextParamSchema,
  overdue: whatsappTextParamSchema,
  deadlines: whatsappTextParamSchema,
  /** The streak line, or a neutral closing until Phase 6. */
  footer: whatsappTextParamSchema,
});
export type DailySummaryRender = z.infer<typeof dailySummaryRenderSchema>;

const templateName = z.string().regex(/^[a-z0-9_]{1,512}$/);
/** Meta's language code, as `pt_BR`. */
const templateLanguage = z.string().regex(/^[a-z]{2,3}(_[A-Z]{2})?$/);

/** What `WhatsAppProvider.send` takes. The provider turns it into the Cloud API payload. */
export const whatsappOutboundSchema = z.discriminatedUnion('kind', [
  /** A utility template with named body parameters. Any time, with opt-in. */
  z.object({
    kind: z.literal('template'),
    to: phoneE164Schema,
    template: templateName,
    language: templateLanguage,
    params: z.record(z.string().regex(/^[a-z][a-z0-9_]{0,31}$/), whatsappTextParamSchema),
  }),
  /** An authentication template: the code goes in the body and in the copy-code button. */
  z.object({
    kind: z.literal('code'),
    to: phoneE164Schema,
    template: templateName,
    language: templateLanguage,
    code: phoneCodeSchema,
  }),
  /** Free text, only as a reply inside the 24-hour window the user opened, as the STOP confirmation. */
  z.object({ kind: z.literal('text'), to: phoneE164Schema, text: z.string().min(1).max(4096) }),
]);
export type WhatsAppOutbound = z.infer<typeof whatsappOutboundSchema>;

/** A short code for `last_error` and `whatsapp_messages.error_code`, as `wa_131026`. Never a message. */
const errorCode = z.string().regex(/^[a-z0-9_]{1,64}$/);

/** What `WhatsAppProvider.send` answers. It never throws for an answer of the API. */
export const whatsappSendResultSchema = z.discriminatedUnion('kind', [
  /** The API took it. Delivery comes later, by the webhook. */
  z.object({
    kind: z.literal('accepted'),
    providerMessageId: z.string().min(1).max(128),
    /** `contacts[0].wa_id`, which may differ from the number sent to. Null from the console. */
    waId: z
      .string()
      .regex(/^\d{6,15}$/)
      .nullable(),
  }),
  z.object({
    kind: z.literal('retry'),
    code: errorCode,
    retryAfterSeconds: z.int().min(0).optional(),
  }),
  z.object({ kind: z.literal('failed'), code: errorCode }),
]);
export type WhatsAppSendResult = z.infer<typeof whatsappSendResultSchema>;

/** `whatsapp_messages.status`. Only moves forward, except to `failed`. */
export const whatsappMessageStatusSchema = z.enum([
  'accepted',
  'sent',
  'delivered',
  'read',
  'failed',
]);
export type WhatsAppMessageStatus = z.infer<typeof whatsappMessageStatusSchema>;

/** `X-Hub-Signature-256`: HMAC-SHA256 of the raw body with the app secret, in lowercase hex. */
export const whatsappSignatureSchema = z.string().regex(/^sha256=[0-9a-f]{64}$/);

/** One element of `statuses`, parsed on its own: a bad one is ignored, not the batch (SEG5-3). */
export const whatsappWebhookStatusSchema = z.object({
  id: z.string().min(1).max(128),
  /** `sent`, `delivered`, `read` or `failed`; anything else is ignored. */
  status: z.string().max(32),
  timestamp: z
    .string()
    .regex(/^\d{1,12}$/)
    .optional(),
  recipient_id: z.string().max(64).optional(),
  errors: z
    .array(z.object({ code: z.int() }))
    .max(10)
    .optional(),
});

/** One element of `messages`, parsed on its own, like the statuses. */
export const whatsappWebhookMessageSchema = z.object({
  from: z.string().regex(/^\d{6,15}$/),
  id: z.string().min(1).max(128),
  type: z.string().max(32),
  text: z.object({ body: z.string().max(4096) }).optional(),
  /** A quick reply button of a template, as "Parar". */
  button: z.object({ text: z.string().max(256) }).optional(),
});

/**
 * The part of a webhook POST the function reads, after the signature. Unknown keys are dropped, and
 * only `statuses` and the stop words in `messages` matter; the rest is ignored and never stored.
 * The elements are `unknown` on purpose: the function parses each one with
 * `whatsappWebhookStatusSchema` or `whatsappWebhookMessageSchema`, so one element out of shape does
 * not drop a signed batch with stop words in it (ADR-0009, section 18, SEG5-3).
 */
export const whatsappWebhookSchema = z.object({
  object: z.literal('whatsapp_business_account'),
  entry: z
    .array(
      z.object({
        changes: z
          .array(
            z.object({
              field: z.string(),
              value: z.object({
                metadata: z.object({ phone_number_id: z.string() }).optional(),
                statuses: z.array(z.unknown()).max(1000).optional(),
                messages: z.array(z.unknown()).max(1000).optional(),
              }),
            }),
          )
          .max(1000),
      }),
    )
    .max(1000),
});
export type WhatsAppWebhook = z.infer<typeof whatsappWebhookSchema>;

/** Raised by the RPCs and answered by `phone-verification`. Any other message is the generic failure. */
export const whatsappErrorCodeSchema = z.enum([
  /** Too many codes for this user or this number, or too soon after the last one, or the daily cap of all codes. */
  'phone_rate_limited',
  /** The country code is not in `whatsappRules.verification.allowedCountryCodes` (SEG5-5). */
  'phone_country_not_allowed',
  /** Wrong code. The same code has `whatsappRules.verification.maxAttempts`. */
  'phone_code_invalid',
  /** No live code: expired, used, replaced or out of attempts. Ask for a new one. */
  'phone_code_expired',
  /** Opt-in or the summary needs a verified phone first. */
  'phone_not_verified',
  /** The app showed an older notice than `whatsappRules.consentVersion`. */
  'invalid_consent_version',
  /** The provider refused the code message. The UI says to check the number. */
  'whatsapp_send_failed',
]);
export type WhatsAppErrorCode = z.infer<typeof whatsappErrorCodeSchema>;

/** Error body of `phone-verification`. `retryAfterSeconds` comes with `phone_rate_limited`. */
export const phoneVerificationErrorSchema = z.object({
  error: whatsappErrorCodeSchema,
  retryAfterSeconds: z.int().min(0).optional(),
});
export type PhoneVerificationError = z.infer<typeof phoneVerificationErrorSchema>;
