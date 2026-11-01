import { CryptoDigestAlgorithm, digest } from 'expo-crypto';

/** Lowercase hex SHA-256 of `bytes`. Native uses expo-crypto; the browser has `crypto.subtle` (`sha256.web.ts`). */
export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const hash = await digest(CryptoDigestAlgorithm.SHA256, bytes as Uint8Array<ArrayBuffer>);
  return Array.from(new Uint8Array(hash), (b) => b.toString(16).padStart(2, '0')).join('');
}
