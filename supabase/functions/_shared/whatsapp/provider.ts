// WhatsApp providers (ADR-0009, section 1). `console` by default: no credentials, nothing leaves the
// stack. `meta` is the Cloud API, written against the docs and tested only with a fake `fetch`.
// Only relative imports with an extension, so Node runs the tests; the contract types are erased.
// The caller passes a message already parsed by `whatsappOutboundSchema`, and logs what it likes from
// the result: the result is only codes. Nothing here logs a phone, a code, a text, a token or a body.
import type {
  WhatsAppOutbound,
  WhatsAppSendResult,
} from '../../../../packages/contracts/src/whatsapp.ts';
import { whatsappDefaults } from '../../../../packages/config/src/whatsapp.ts';
import type { WhatsAppEnv } from '../../../../packages/config/src/whatsapp-env.ts';
import { readLimited } from '../body.ts';
import { retryAfterSeconds } from '../retry-after.ts';

export interface WhatsAppProvider {
  readonly name: 'console' | 'meta';
  send(message: WhatsAppOutbound): Promise<WhatsAppSendResult>;
}

/** Writes the whole message to `whatsapp_console_messages`. Throws if the write fails. */
export type ConsoleRecord = (to: string, message: WhatsAppOutbound) => Promise<void>;

/** The development outbox: the E2E reads the code and the summary from the table, never the log. */
export class ConsoleProvider implements WhatsAppProvider {
  readonly name = 'console' as const;
  readonly #record: ConsoleRecord;
  readonly #log: (line: string) => void;

  constructor(record: ConsoleRecord, log: (line: string) => void = console.log) {
    this.#record = record;
    this.#log = log;
  }

  async send(message: WhatsAppOutbound): Promise<WhatsAppSendResult> {
    await this.#record(message.to, message);
    this.#log(
      JSON.stringify({
        event: 'whatsapp_console',
        kind: message.kind,
        template: message.kind === 'text' ? null : message.template,
      }),
    );
    return { kind: 'accepted', providerMessageId: `console.${crypto.randomUUID()}`, waId: null };
  }
}

/** The Cloud API body of one message. */
export function metaPayload(message: WhatsAppOutbound): Record<string, unknown> {
  const base = { messaging_product: 'whatsapp', recipient_type: 'individual', to: message.to };
  if (message.kind === 'text') {
    return { ...base, type: 'text', text: { preview_url: false, body: message.text } };
  }
  const text = (value: string) => ({ type: 'text', text: value });
  const components =
    message.kind === 'code'
      ? // Authentication template: the code in the body and again in the copy-code button.
        [
          { type: 'body', parameters: [text(message.code)] },
          { type: 'button', sub_type: 'url', index: '0', parameters: [text(message.code)] },
        ]
      : [
          {
            type: 'body',
            parameters: Object.entries(message.params).map(([name, value]) => ({
              ...text(value),
              parameter_name: name,
            })),
          },
        ];
  return {
    ...base,
    type: 'template',
    template: { name: message.template, language: { code: message.language }, components },
  };
}

/** Meta's codes worth another try: throughput, rate, unknown and unavailable (ADR-0009, section 1). */
const retryCodes = new Set([130429, 131056, 131000, 133004]);
// ponytail: an answer of the Cloud API is a few hundred bytes; past this it is not one.
const ANSWER_MAX_BYTES = 65_536;

type Answer = {
  messages?: { id?: unknown }[];
  contacts?: { wa_id?: unknown }[];
  error?: { code?: unknown };
} | null;

async function readAnswer(
  body: ReadableStream<Uint8Array> | null,
  timeoutMs: number,
): Promise<Answer> {
  const read = await readLimited(body, ANSWER_MAX_BYTES, timeoutMs);
  if (read.kind !== 'ok') return null;
  try {
    const parsed: unknown = JSON.parse(new TextDecoder().decode(read.bytes));
    return parsed && typeof parsed === 'object' ? (parsed as Answer) : null;
  } catch {
    return null;
  }
}

export type MetaOptions = {
  token: string;
  phoneNumberId: string;
  /** Injected so the tests never reach the real API. */
  fetch: typeof fetch;
  baseUrl: string;
  version: string;
  timeoutMs: number;
};

export class MetaCloudProvider implements WhatsAppProvider {
  readonly name = 'meta' as const;
  /** Private, so neither JSON.stringify nor a log of the object shows the token. */
  readonly #options: MetaOptions;

  constructor(options: MetaOptions) {
    this.#options = options;
  }

  async send(message: WhatsAppOutbound): Promise<WhatsAppSendResult> {
    const o = this.#options;
    let response: Response;
    try {
      response = await o.fetch(`${o.baseUrl}/${o.version}/${o.phoneNumberId}/messages`, {
        method: 'POST',
        // Never followed, like Web Push: a redirect would carry the token to another host.
        redirect: 'manual',
        signal: AbortSignal.timeout(o.timeoutMs),
        headers: { authorization: `Bearer ${o.token}`, 'content-type': 'application/json' },
        body: JSON.stringify(metaPayload(message)),
      });
    } catch (error) {
      // The error itself is dropped: its message could quote the request.
      const timedOut = error instanceof Error && error.name === 'TimeoutError';
      return { kind: 'retry', code: timedOut ? 'wa_timeout' : 'wa_network' };
    }
    const status = response.status;
    if (response.type === 'opaqueredirect' || (status >= 300 && status < 400)) {
      response.body?.cancel().catch(() => {});
      return { kind: 'failed', code: 'wa_redirect' };
    }
    const answer = await readAnswer(response.body, o.timeoutMs);
    if (status >= 200 && status < 300) {
      const id = answer?.messages?.[0]?.id;
      const waId = answer?.contacts?.[0]?.wa_id;
      // Not a retry: the message may be out already, and a retry would send it twice.
      if (typeof id !== 'string' || id.length === 0 || id.length > 128) {
        return { kind: 'failed', code: 'wa_bad_response' };
      }
      return {
        kind: 'accepted',
        providerMessageId: id,
        waId: typeof waId === 'string' && /^\d{6,15}$/.test(waId) ? waId : null,
      };
    }
    const metaCode = answer?.error?.code;
    const known =
      Number.isSafeInteger(metaCode) && (metaCode as number) >= 0 ? (metaCode as number) : null;
    const code =
      known !== null ? `wa_${known}` : status === 429 ? 'wa_rate_limited' : `wa_http_${status}`;
    if (status === 429 || status >= 500 || (known !== null && retryCodes.has(known))) {
      const wait = retryAfterSeconds(response.headers.get('retry-after'), Date.now());
      return wait === undefined
        ? { kind: 'retry', code }
        : { kind: 'retry', code, retryAfterSeconds: wait };
    }
    return { kind: 'failed', code };
  }
}

/**
 * The provider of `parseWhatsAppEnv(Deno.env.toObject())`: `console` when WHATSAPP_PROVIDER is empty.
 * `record` writes `whatsapp_console_messages`; only the console provider calls it.
 */
export function createWhatsAppProvider(
  env: WhatsAppEnv,
  deps: { fetch: typeof fetch; record: ConsoleRecord },
): WhatsAppProvider {
  if (env.WHATSAPP_PROVIDER === 'console') return new ConsoleProvider(deps.record);
  return new MetaCloudProvider({
    token: env.WHATSAPP_ACCESS_TOKEN,
    phoneNumberId: env.WHATSAPP_PHONE_NUMBER_ID,
    fetch: deps.fetch,
    baseUrl: whatsappDefaults.graphApiBaseUrl,
    version: whatsappDefaults.graphApiVersion,
    timeoutMs: whatsappDefaults.sendTimeoutMs,
  });
}
