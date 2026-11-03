// Native push by the Expo push API (ADR-0012, section 11). Not a channel of its own: the devices of the
// app are subscriptions of `web_push`, and WebPushChannel hands them here. One request per notification
// with every token of the user, and one ticket back per token, in order. Receipts (the second call) are
// not read: a `DeviceNotRegistered` there is caught by the next ticket. Nothing here logs: a token is a
// capability, and the message has a title. Imports that Node resolves, so it runs the tests.
import { z } from 'zod';
import type { NativePushMessage } from '../../../packages/contracts/src/notifications.ts';
import { readLimited } from '../_shared/body.ts';
import { retryAfterSeconds } from '../_shared/retry-after.ts';
import type { ExpoSubscription, OutboundMessage } from './dispatch.ts';
import type { Delivery } from './web-push.ts';

export const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
// ponytail: a ticket is under a hundred bytes and a user has a few devices; past this it is not one.
const ANSWER_MAX_BYTES = 65_536;

const ticketSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('ok'), id: z.string().min(1).max(128) }),
  z.object({
    status: z.literal('error'),
    details: z.object({ error: z.string().max(64).optional() }).optional(),
  }),
]);
const answerSchema = z.object({ data: z.array(ticketSchema) });
type Ticket = z.infer<typeof ticketSchema>;

/** ADR-0012, section 11: `DeviceNotRegistered` deletes, as 404 and 410 on the web. Codes are ours. */
export function classifyTicket(ticket: Ticket): Delivery {
  if (ticket.status === 'ok') return { kind: 'sent' };
  switch (ticket.details?.error) {
    case 'DeviceNotRegistered':
      return { kind: 'gone' };
    case 'MessageRateExceeded':
      return { kind: 'retry', code: 'expo_rate_limited' };
    case 'MessageTooBig':
      return { kind: 'failed', code: 'expo_too_large' };
    // Ours to fix (FCM or APNs credentials in EAS): the device is kept.
    case 'InvalidCredentials':
    case 'MismatchSenderId':
      return { kind: 'failed', code: 'expo_credentials' };
    default:
      return { kind: 'failed', code: 'expo_error' };
  }
}

export type NativePushOptions = {
  /** The message for one token, already validated by `nativePushMessageSchema`. */
  render: (message: OutboundMessage, to: string) => NativePushMessage;
  /** The Expo API, or `fakeExpoFetch`. Injected so no test reaches Expo. */
  fetch: typeof fetch;
  /** `EXPO_ACCESS_TOKEN`, when the project enforces it. Never logged. */
  accessToken?: string;
  timeoutMs: number;
};

export class NativePushChannel {
  /** Private, so neither JSON.stringify nor a log of the object shows the token. */
  readonly #options: NativePushOptions;

  constructor(options: NativePushOptions) {
    this.#options = options;
  }

  /** One delivery per subscription, in order. A render that throws fails the row (`send_error`). */
  async deliver(message: OutboundMessage, subscriptions: ExpoSubscription[]): Promise<Delivery[]> {
    const o = this.#options;
    const all = (delivery: Delivery) => subscriptions.map(() => delivery);
    const body = JSON.stringify(subscriptions.map((s) => o.render(message, s.expoToken)));
    let response: Response;
    try {
      response = await o.fetch(EXPO_PUSH_URL, {
        method: 'POST',
        // Never followed: a redirect would carry the tokens to another host.
        redirect: 'manual',
        signal: AbortSignal.timeout(o.timeoutMs),
        headers: {
          accept: 'application/json',
          'content-type': 'application/json',
          ...(o.accessToken && { authorization: `Bearer ${o.accessToken}` }),
        },
        body,
      });
    } catch (error) {
      const timedOut = error instanceof Error && error.name === 'TimeoutError';
      return all({ kind: 'retry', code: timedOut ? 'expo_timeout' : 'expo_network' });
    }
    const status = response.status;
    if (response.type === 'opaqueredirect' || (status >= 300 && status < 400)) {
      response.body?.cancel().catch(() => {});
      return all({ kind: 'failed', code: 'expo_redirect' });
    }
    if (status < 200 || status >= 300) {
      response.body?.cancel().catch(() => {});
      if (status === 429) {
        const wait = retryAfterSeconds(response.headers.get('retry-after'), Date.now());
        return all({ kind: 'retry', code: 'expo_rate_limited', retryAfterSeconds: wait });
      }
      if (status >= 500) return all({ kind: 'retry', code: 'expo_server_error' });
      return all({ kind: 'failed', code: `expo_http_${status}` });
    }
    // Not a retry: the messages may be out already, and a retry would send them twice.
    const bad = all({ kind: 'failed', code: 'expo_bad_response' });
    const read = await readLimited(response.body, ANSWER_MAX_BYTES, o.timeoutMs);
    if (read.kind !== 'ok') return bad;
    let raw: unknown;
    try {
      raw = JSON.parse(new TextDecoder().decode(read.bytes));
    } catch {
      return bad;
    }
    const answer = answerSchema.safeParse(raw);
    if (!answer.success || answer.data.data.length !== subscriptions.length) return bad;
    return answer.data.data.map(classifyTicket);
  }
}

/**
 * The provider of the tests and the local stack: logs how many messages it would send, never what,
 * and answers one `ok` ticket for each. Nothing leaves the function.
 */
export function fakeExpoFetch(log: (line: string) => void = console.log): typeof fetch {
  return (async (_url: string | URL | Request, init?: RequestInit) => {
    const messages = JSON.parse(String(init?.body)) as unknown[];
    log(JSON.stringify({ event: 'native_push_fake', messages: messages.length }));
    const data = messages.map(() => ({ status: 'ok', id: `fake.${crypto.randomUUID()}` }));
    return new Response(JSON.stringify({ data }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }) as typeof fetch;
}

const blank = (value: unknown) => (value === '' ? undefined : value);
const nativePushEnvSchema = z.discriminatedUnion('NATIVE_PUSH_PROVIDER', [
  z.object({ NATIVE_PUSH_PROVIDER: z.literal('fake') }),
  z.object({ NATIVE_PUSH_PROVIDER: z.literal('expo'), EXPO_ACCESS_TOKEN: z.string().min(16) }),
]);

/**
 * How the function reaches Expo, from its secrets. Absent or empty provider is `fake`. The real API
 * only with `NATIVE_PUSH_PROVIDER=expo` and a token; anything else is not configured: logged by event
 * name only, and the devices are not sent to (their rows retry, then fail).
 */
export function nativePushTransport(
  values: { NATIVE_PUSH_PROVIDER?: string; EXPO_ACCESS_TOKEN?: string },
  realFetch: typeof fetch,
  log: (line: string) => void = console.error,
): Pick<NativePushOptions, 'fetch' | 'accessToken'> | null {
  const env = nativePushEnvSchema.safeParse({
    NATIVE_PUSH_PROVIDER: blank(values.NATIVE_PUSH_PROVIDER) ?? 'fake',
    EXPO_ACCESS_TOKEN: blank(values.EXPO_ACCESS_TOKEN),
  });
  if (!env.success) {
    log(JSON.stringify({ event: 'native_push_not_configured' }));
    return null;
  }
  if (env.data.NATIVE_PUSH_PROVIDER === 'fake') return { fetch: fakeExpoFetch() };
  return { fetch: realFetch, accessToken: env.data.EXPO_ACCESS_TOKEN };
}
