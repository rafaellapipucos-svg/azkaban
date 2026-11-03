import { z } from 'zod';

// Edge Function secrets of WhatsApp (ADR-0009, section 12). Names only in the .env.example files:
// the repository is public. An empty line counts as absent.
const blank = (value: unknown) => (value === '' ? undefined : value);
const secret = z.preprocess(blank, z.string().min(16).optional());

// The `local-demo-*` values of the .env.example are public: with them, anyone signs a webhook and
// sends a stop for a known number. `meta` refuses them (ADR-0009, section 18, SEG5-8).
const realSecret = z
  .string()
  .min(16)
  .refine((value) => !value.startsWith('local-demo-'), 'a local demo value');

const phoneNumberId = z.string().regex(/^\d{5,20}$/);

const shared = {
  /** App secret of the Meta app: the key of `X-Hub-Signature-256`. Without it, the webhook answers 500. */
  WHATSAPP_APP_SECRET: secret,
  /** Chosen by us and typed in the App Dashboard. Without it, the webhook GET answers 403. */
  WHATSAPP_VERIFY_TOKEN: secret,
};

const whatsappEnvSchema = z.discriminatedUnion('WHATSAPP_PROVIDER', [
  /** Logs and writes to `whatsapp_console_messages`. Local and CI, with no credentials. */
  z.object({
    WHATSAPP_PROVIDER: z.literal('console'),
    ...shared,
    /** Optional here: when set, the webhook still drops events for any other number. */
    WHATSAPP_PHONE_NUMBER_ID: z.preprocess(blank, phoneNumberId.optional()),
  }),
  z.object({
    WHATSAPP_PROVIDER: z.literal('meta'),
    ...shared,
    WHATSAPP_APP_SECRET: realSecret,
    WHATSAPP_VERIFY_TOKEN: realSecret,
    /** System user token with `whatsapp_business_messaging`. Never logged. */
    WHATSAPP_ACCESS_TOKEN: z.string().min(32),
    WHATSAPP_PHONE_NUMBER_ID: phoneNumberId,
  }),
]);

export type WhatsAppEnv = z.infer<typeof whatsappEnvSchema>;

/** Absent provider is `console`, so local and CI work with no credentials at all. */
export function parseWhatsAppEnv(values: Record<string, string | undefined>): WhatsAppEnv {
  return whatsappEnvSchema.parse({
    ...values,
    WHATSAPP_PROVIDER: blank(values.WHATSAPP_PROVIDER) ?? 'console',
  });
}
