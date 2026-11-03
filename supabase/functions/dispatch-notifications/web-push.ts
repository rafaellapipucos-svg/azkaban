// Web Push without a library (ADR-0008, section 8): aes128gcm (RFC 8291) and VAPID (RFC 8292) on
// WebCrypto, which Deno and Node both have. Only relative imports, so Node runs the tests, including the
// vector of RFC 8291, appendix A. Nothing here logs: an endpoint is a capability, and the payload has a title.
import { retryAfterSeconds } from '../_shared/retry-after.ts';
import type { NotificationChannel, OutboundMessage, SendResult } from './dispatch.ts';

export { retryAfterSeconds };

const encoder = new TextEncoder();

export function fromBase64Url(text: string): Uint8Array {
  const base64 = text.replace(/-/g, '+').replace(/_/g, '/').replace(/=+$/, '');
  const binary = atob(base64 + '='.repeat((4 - (base64.length % 4)) % 4));
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

export function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}

/** A P-256 private key from its raw 32 bytes and the 65-byte uncompressed public point. */
export function importPrivateKey(
  d: Uint8Array,
  publicKey: Uint8Array,
  algorithm: 'ECDH' | 'ECDSA',
): Promise<CryptoKey> {
  if (d.length !== 32 || publicKey.length !== 65 || publicKey[0] !== 4) {
    throw new Error('bad_key');
  }
  const jwk = {
    kty: 'EC',
    crv: 'P-256',
    d: toBase64Url(d),
    x: toBase64Url(publicKey.subarray(1, 33)),
    y: toBase64Url(publicKey.subarray(33)),
    ext: false,
  };
  const usages: KeyUsage[] = algorithm === 'ECDH' ? ['deriveBits'] : ['sign'];
  return crypto.subtle.importKey(
    'jwk',
    jwk,
    { name: algorithm, namedCurve: 'P-256' },
    false,
    usages,
  );
}

async function hkdf(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, bytes: number) {
  const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt, info },
    key,
    bytes * 8,
  );
  return new Uint8Array(bits);
}

/** The sender's side of one message. Random in production; fixed only by the RFC vector test. */
export type Ephemeral = { salt: Uint8Array; privateKey: CryptoKey; publicKey: Uint8Array };

export async function newEphemeral(): Promise<Ephemeral> {
  const pair = (await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, false, [
    'deriveBits',
  ])) as CryptoKeyPair;
  const publicKey = new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey));
  return {
    salt: crypto.getRandomValues(new Uint8Array(16)),
    privateKey: pair.privateKey,
    publicKey,
  };
}

const RECORD_SIZE = 4096;

/** RFC 8291, section 3, in one record: the header of RFC 8188 with the sender's key as `keyid`. */
export async function encrypt(
  plaintext: Uint8Array,
  uaPublic: Uint8Array,
  authSecret: Uint8Array,
  ephemeral: Ephemeral,
): Promise<Uint8Array> {
  if (uaPublic.length !== 65 || authSecret.length !== 16) throw new Error('bad_subscription_keys');
  const peer = await crypto.subtle.importKey(
    'raw',
    uaPublic,
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    [],
  );
  const shared = new Uint8Array(
    await crypto.subtle.deriveBits({ name: 'ECDH', public: peer }, ephemeral.privateKey, 256),
  );
  const keyInfo = concat(encoder.encode('WebPush: info\0'), uaPublic, ephemeral.publicKey);
  const ikm = await hkdf(authSecret, shared, keyInfo, 32);
  const cek = await hkdf(ephemeral.salt, ikm, encoder.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(ephemeral.salt, ikm, encoder.encode('Content-Encoding: nonce\0'), 12);
  const key = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  // 0x02 marks the last (and only) record, with no padding.
  const sealed = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: nonce },
      key,
      concat(plaintext, Uint8Array.of(2)),
    ),
  );
  const header = new Uint8Array(21);
  header.set(ephemeral.salt, 0);
  new DataView(header.buffer).setUint32(16, RECORD_SIZE);
  header[20] = ephemeral.publicKey.length;
  return concat(header, ephemeral.publicKey, sealed);
}

/** RFC 8292: a JWT for the push service's origin, signed with the VAPID key, valid for 12 hours. */
export async function vapidAuthorization(
  audience: string,
  vapid: VapidKeys,
  nowSeconds: number,
): Promise<string> {
  const part = (value: unknown) => toBase64Url(encoder.encode(JSON.stringify(value)));
  const unsigned = `${part({ typ: 'JWT', alg: 'ES256' })}.${part({
    aud: audience,
    exp: nowSeconds + 12 * 3600,
    sub: vapid.subject,
  })}`;
  // WebCrypto signs ECDSA as r || s, which is what JWS wants.
  const signature = new Uint8Array(
    await crypto.subtle.sign(
      { name: 'ECDSA', hash: 'SHA-256' },
      vapid.privateKey,
      encoder.encode(unsigned),
    ),
  );
  return `vapid t=${unsigned}.${toBase64Url(signature)}, k=${vapid.publicKey}`;
}

export type VapidKeys = {
  privateKey: CryptoKey;
  /** base64url of the 65-byte public point, the same as EXPO_PUBLIC_VAPID_PUBLIC_KEY. */
  publicKey: string;
  subject: string;
};

/** Null when a secret is missing or malformed: the function then refuses before claiming anything. */
export async function loadVapid(
  privateKey: string | undefined,
  publicKey: string | undefined,
  subject: string | undefined,
): Promise<VapidKeys | null> {
  if (!privateKey || !publicKey || !subject) return null;
  // The Apple service refuses any other subject.
  if (!/^(mailto:.+|https:\/\/.+)$/.test(subject)) return null;
  try {
    const key = await importPrivateKey(
      fromBase64Url(privateKey),
      fromBase64Url(publicKey),
      'ECDSA',
    );
    return { privateKey: key, publicKey, subject };
  } catch {
    return null;
  }
}

/**
 * The host the function will POST to, checked again on the parsed URL: HTTPS, default port, no
 * credentials, and an allowed host itself or a subdomain of it (`notificationRules.pushEndpointHosts`).
 */
export function endpointAllowed(endpoint: string, hosts: readonly string[]): boolean {
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return false;
  }
  if (url.protocol !== 'https:' || url.port !== '' || url.username || url.password) return false;
  return hosts.some((host) => url.hostname === host || url.hostname.endsWith(`.${host}`));
}

/** One subscription's answer, before the answers of all of them become one result. */
type Delivery =
  | { kind: 'sent' }
  | { kind: 'gone' }
  | { kind: 'retry'; code: string; retryAfterSeconds?: number }
  | { kind: 'failed'; code: string };

/** ADR-0008, section 8. Codes are ours, short, and never the service's message. */
export function classify(status: number, retryAfter: number | undefined): Delivery {
  if (status >= 200 && status < 300) return { kind: 'sent' };
  if (status === 404 || status === 410) return { kind: 'gone' };
  if (status === 429)
    return { kind: 'retry', code: 'push_rate_limited', retryAfterSeconds: retryAfter };
  if (status >= 500) return { kind: 'retry', code: 'push_server_error' };
  // Not deleted: a key that does not match is fixed on the server, and the subscriptions come back.
  if (status === 403) return { kind: 'failed', code: 'push_forbidden' };
  if (status === 413) return { kind: 'failed', code: 'push_too_large' };
  // A redirect is never followed, so it cannot lead the request to another host.
  if (status >= 300 && status < 400) return { kind: 'failed', code: 'push_redirect' };
  return { kind: 'failed', code: `push_http_${status}` };
}

/**
 * One delivery is enough for `sent`, and the transient failures of the others are not retried, so
 * nobody gets it twice where it already arrived. Without one, a transient failure retries, and the
 * longest `Retry-After` wins. Gone subscriptions are reported with any of them.
 */
export function combine(ids: string[], deliveries: Delivery[]): SendResult {
  const delivered = ids.filter((_, i) => deliveries[i]!.kind === 'sent');
  const gone = ids.filter((_, i) => deliveries[i]!.kind === 'gone');
  if (delivered.length > 0) return { kind: 'sent', delivered, gone };
  const retries = deliveries.filter((d) => d.kind === 'retry');
  if (retries.length > 0) {
    const waits = retries.flatMap((d) =>
      d.retryAfterSeconds === undefined ? [] : [d.retryAfterSeconds],
    );
    return {
      kind: 'retry',
      code: retries[0]!.code,
      retryAfterSeconds: waits.length > 0 ? Math.max(...waits) : undefined,
      gone,
    };
  }
  const failure = deliveries.find((d) => d.kind === 'failed');
  if (failure) return { kind: 'failed', code: failure.code, gone };
  return { kind: 'gone', subscriptionIds: gone };
}

export type TtlRules = { pushTtlSeconds: number; minPushTtlSeconds: number };

/**
 * A reminder is worth ringing only until its anchor, and never for less than the minimum; the rest
 * keep `pushTtlSeconds`. The reminder is capped by it too: a lead of 30 days is longer than some
 * services accept, and the outbox gives up after `maxDelayHours` anyway.
 */
export function ttlSeconds(message: OutboundMessage, nowMs: number, rules: TtlRules): number {
  if (message.type !== 'task_reminder') return rules.pushTtlSeconds;
  const anchor = Date.parse(String(message.data.anchorAt));
  const left = Number.isNaN(anchor) ? rules.minPushTtlSeconds : Math.ceil((anchor - nowMs) / 1000);
  return Math.min(rules.pushTtlSeconds, Math.max(rules.minPushTtlSeconds, left));
}

export type WebPushOptions = {
  vapid: VapidKeys;
  hosts: readonly string[];
  /** Body of the push, already validated and in the recipient's language. */
  render: (message: OutboundMessage) => string;
  ttl: TtlRules;
  /** Injected so the tests never reach a real push service. */
  fetch: typeof fetch;
  timeoutMs: number;
  now?: () => number;
  newEphemeral?: () => Promise<Ephemeral>;
};

export class WebPushChannel implements NotificationChannel {
  readonly channel = 'web_push' as const;
  readonly #options: WebPushOptions;
  /** One JWT per push service origin and run: they are valid for 12 hours. */
  readonly #tokens = new Map<string, Promise<string>>();

  constructor(options: WebPushOptions) {
    this.#options = options;
  }

  async send(message: OutboundMessage): Promise<SendResult> {
    const subscriptions = message.subscriptions;
    if (subscriptions.length === 0) return { kind: 'failed', code: 'no_subscription' };
    const body = encoder.encode(this.#options.render(message));
    const deliveries = await Promise.all(subscriptions.map((s) => this.#deliver(message, s, body)));
    return combine(
      subscriptions.map((s) => s.id),
      deliveries,
    );
  }

  async #deliver(
    message: OutboundMessage,
    subscription: OutboundMessage['subscriptions'][number],
    body: Uint8Array,
  ): Promise<Delivery> {
    const options = this.#options;
    const now = (options.now ?? Date.now)();
    // The RPC checked the host when the row was written. The list may have changed since, and this
    // is the request that would go out, so it is checked here too.
    if (!endpointAllowed(subscription.endpoint, options.hosts)) {
      return { kind: 'failed', code: 'push_endpoint_not_allowed' };
    }
    let encrypted: Uint8Array;
    try {
      encrypted = await encrypt(
        body,
        fromBase64Url(subscription.p256dh),
        fromBase64Url(subscription.auth),
        await (options.newEphemeral ?? newEphemeral)(),
      );
    } catch {
      return { kind: 'failed', code: 'push_bad_keys' };
    }
    const origin = new URL(subscription.endpoint).origin;
    let token = this.#tokens.get(origin);
    if (!token) {
      token = vapidAuthorization(origin, options.vapid, Math.floor(now / 1000));
      this.#tokens.set(origin, token);
    }
    let response: Response;
    try {
      response = await options.fetch(subscription.endpoint, {
        method: 'POST',
        redirect: 'manual',
        signal: AbortSignal.timeout(options.timeoutMs),
        headers: {
          authorization: await token,
          'content-encoding': 'aes128gcm',
          'content-type': 'application/octet-stream',
          ttl: String(ttlSeconds(message, now, options.ttl)),
          urgency: message.type === 'task_reminder' ? 'high' : 'normal',
        },
        body: encrypted,
      });
    } catch {
      return { kind: 'retry', code: 'push_network' };
    }
    // The answer's body is never read: it can be large, and it can quote the endpoint.
    response.body?.cancel().catch(() => {});
    return classify(response.status, retryAfterSeconds(response.headers.get('retry-after'), now));
  }
}
