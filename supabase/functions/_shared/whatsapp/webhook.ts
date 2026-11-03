// The pure parts of whatsapp-webhook (ADR-0009, section 7): the GET challenge, the signature, and
// what a parsed POST asks of the database. Only relative imports with an extension, so Node runs the
// tests; the element schemas come in as an argument. Nothing here logs; what the function logs is
// counts and codes.
import type {
  WhatsAppMessageStatus,
  WhatsAppWebhook,
  whatsappWebhookMessageSchema,
  whatsappWebhookStatusSchema,
} from '../../../../packages/contracts/src/whatsapp.ts';
import { sameSecret } from '../secret.ts';

const encoder = new TextEncoder();

/**
 * The `hub.challenge` to answer with 200, or null for 403: a wrong mode, a wrong or missing token, a
 * challenge out of shape, or no token configured at all.
 */
export async function challengeAnswer(
  params: URLSearchParams,
  verifyToken: string | undefined,
): Promise<string | null> {
  const given = params.get('hub.verify_token');
  const challenge = params.get('hub.challenge');
  if (!verifyToken || params.get('hub.mode') !== 'subscribe' || given === null) return null;
  if (challenge === null || !/^[A-Za-z0-9_-]{1,128}$/.test(challenge)) return null;
  return (await sameSecret(given, verifyToken)) ? challenge : null;
}

/** Same shape as `whatsappSignatureSchema`, which Node cannot import here. */
const signatureShape = /^sha256=[0-9a-f]{64}$/;

/**
 * `X-Hub-Signature-256` against the raw bytes as they arrived, never a reserialized body.
 * `crypto.subtle.verify` compares in constant time.
 */
export async function validSignature(
  raw: Uint8Array,
  header: string | null,
  appSecret: string,
): Promise<boolean> {
  if (header === null || !signatureShape.test(header)) return false;
  const mac = Uint8Array.from(header.slice(7).match(/../g)!, (pair) => parseInt(pair, 16));
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(appSecret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify'],
  );
  // readLimited's bytes sit on a plain ArrayBuffer; the lib types only allow for a shared one.
  return crypto.subtle.verify('HMAC', key, mac, raw as Uint8Array<ArrayBuffer>);
}

/**
 * Trimmed, lowercased, without accents, punctuation, symbols or invisible format characters (zero
 * width space, direction marks, ZWJ, BOM), and with compatibility forms folded, so full-width "ＰＡＲＡＲ"
 * is "parar" too (SEG5-2). "Parar." and "PARAR!" are "parar".
 */
export function normalizeReply(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/[\p{M}\p{P}\p{S}\p{Cf}]/gu, '')
    .trim()
    .toLowerCase();
}

/** The whole message is a stop word. "Não quero parar" is not. */
export function isStop(text: string, stopWords: readonly string[]): boolean {
  return stopWords.includes(normalizeReply(text));
}

export type StatusEvent = {
  providerMessageId: string;
  status: Exclude<WhatsAppMessageStatus, 'accepted'>;
  /** From Meta's Unix seconds, or null. */
  at: string | null;
  /** `wa_<code>` of a `failed`, or null. */
  errorCode: string | null;
};

/** The statuses `record_whatsapp_statuses` takes; `accepted` is ours, never Meta's. */
const meaningful: readonly StatusEvent['status'][] = ['sent', 'delivered', 'read', 'failed'];
// The largest instant Postgres and `toISOString` both write as a plain year.
const MAX_MS = 253_402_300_799_000;

export type WebhookWork = {
  statuses: StatusEvent[];
  /** `from` of each message that is a stop word, once each. */
  stopWaIds: string[];
  /** Elements out of shape, statuses of other names, and messages that are not a stop. Counted. */
  ignored: number;
};

export type WebhookElementSchemas = {
  status: typeof whatsappWebhookStatusSchema;
  message: typeof whatsappWebhookMessageSchema;
};

/**
 * What a parsed POST asks for. Only `field = messages` counts, and with `phoneNumberId`, only changes
 * for our number. Without it (no number configured) every number counts. Each status and message is
 * parsed on its own, so one out of shape is counted in `ignored` and the rest still counts (SEG5-3).
 */
export function readWebhook(
  webhook: WhatsAppWebhook,
  phoneNumberId: string | undefined,
  stopWords: readonly string[],
  schemas: WebhookElementSchemas,
): WebhookWork {
  const work: WebhookWork = { statuses: [], stopWaIds: [], ignored: 0 };
  for (const entry of webhook.entry) {
    for (const change of entry.changes) {
      const value = change.value;
      if (change.field !== 'messages') continue;
      if (phoneNumberId !== undefined && value.metadata?.phone_number_id !== phoneNumberId)
        continue;
      for (const element of value.statuses ?? []) {
        const parsed = schemas.status.safeParse(element);
        if (!parsed.success) {
          work.ignored += 1;
          continue;
        }
        const status = parsed.data;
        const name = meaningful.find((known) => known === status.status);
        if (!name) {
          work.ignored += 1;
          continue;
        }
        const ms = status.timestamp === undefined ? NaN : Number(status.timestamp) * 1000;
        const metaCode = status.errors?.[0]?.code;
        work.statuses.push({
          providerMessageId: status.id,
          status: name,
          at: ms <= MAX_MS ? new Date(ms).toISOString() : null,
          errorCode:
            name === 'failed' && metaCode !== undefined && metaCode >= 0 ? `wa_${metaCode}` : null,
        });
      }
      for (const element of value.messages ?? []) {
        const parsed = schemas.message.safeParse(element);
        if (!parsed.success) {
          work.ignored += 1;
          continue;
        }
        const message = parsed.data;
        const text = message.text?.body ?? message.button?.text;
        if (text !== undefined && isStop(text, stopWords)) {
          if (!work.stopWaIds.includes(message.from)) work.stopWaIds.push(message.from);
        } else {
          work.ignored += 1;
        }
      }
    }
  }
  return work;
}
