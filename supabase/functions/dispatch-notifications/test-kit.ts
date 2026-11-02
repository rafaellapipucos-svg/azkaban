// Test helpers only: a browser's side of Web Push, written from RFC 8291 apart from web-push.ts, and
// key pairs made in memory for each run. Never imported by the function.
import assert from 'node:assert/strict';
import { toBase64Url } from './web-push.ts';

const encoder = new TextEncoder();

async function hkdf(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, bytes: number) {
  const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  return new Uint8Array(
    await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, key, bytes * 8),
  );
}

/** A browser's subscription keys. */
export async function browser() {
  const pair = (await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, [
    'deriveBits',
  ])) as CryptoKeyPair;
  const publicKey = new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey));
  const auth = crypto.getRandomValues(new Uint8Array(16));
  return { privateKey: pair.privateKey, publicKey, auth };
}
export type Browser = Awaited<ReturnType<typeof browser>>;

/** What the browser reads out of an aes128gcm body, and the record size of its header. */
export async function decrypt(body: Uint8Array, ua: Browser) {
  const salt = body.subarray(0, 16);
  const idlen = body[20]!;
  const asPublic = body.subarray(21, 21 + idlen);
  const peer = await crypto.subtle.importKey(
    'raw',
    asPublic,
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    [],
  );
  const shared = new Uint8Array(
    await crypto.subtle.deriveBits({ name: 'ECDH', public: peer }, ua.privateKey, 256),
  );
  const info = new Uint8Array([...encoder.encode('WebPush: info\0'), ...ua.publicKey, ...asPublic]);
  const ikm = await hkdf(ua.auth, shared, info, 32);
  const cek = await hkdf(salt, ikm, encoder.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, ikm, encoder.encode('Content-Encoding: nonce\0'), 12);
  const key = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['decrypt']);
  const plain = new Uint8Array(
    await crypto.subtle.decrypt({ name: 'AES-GCM', iv: nonce }, key, body.subarray(21 + idlen)),
  );
  assert.equal(plain.at(-1), 2, 'last record delimiter');
  return {
    text: new TextDecoder().decode(plain.subarray(0, -1)),
    rs: new DataView(body.buffer, body.byteOffset).getUint32(16),
  };
}

/** A VAPID pair as the secrets hold it: `d` and the public point, both base64url. */
export async function vapidPair() {
  const pair = (await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, [
    'sign',
    'verify',
  ])) as CryptoKeyPair;
  const jwk = await crypto.subtle.exportKey('jwk', pair.privateKey);
  const publicKey = toBase64Url(
    new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey)),
  );
  return { d: jwk.d!, publicKey, verifyKey: pair.publicKey };
}
