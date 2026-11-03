// No imports beyond the runtime, so Node runs the tests that use it (_shared/whatsapp).
import { timingSafeEqual } from 'node:crypto';

/** Both digests have the same length, which timingSafeEqual needs, so the secret's length does not leak. */
export async function sameSecret(given: string, expected: string): Promise<boolean> {
  const digest = async (text: string) =>
    new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));
  return timingSafeEqual(await digest(given), await digest(expected));
}
