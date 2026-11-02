import { proofDefaults, proofRules } from '@azkaban/config';

/** Everything the final image must satisfy before it leaves the device (ADR-0007, sections 3 and 6). */
export type PhotoLimits = {
  longEdgePx: number;
  /** First JPEG quality tried, 0 to 1. */
  quality: number;
  maxBytes: number;
  minEdgePx: number;
  maxEdgePx: number;
};

export const photoLimits: PhotoLimits = {
  longEdgePx: proofDefaults.captureLongEdgePx,
  quality: proofDefaults.captureJpegQuality,
  maxBytes: proofRules.maxBytes,
  minEdgePx: proofRules.minEdgePx,
  maxEdgePx: proofRules.maxEdgePx,
};

/** What the caller writes on the photo. The time is taken by the adapter at the moment of capture. */
export type ProofStamp = {
  taskTitle: string;
  userName: string;
  /** BCP 47 tag used to write the date and time. */
  locale: string;
  /** IANA name. Omitted, the device zone is used. */
  timeZone?: string;
};

/** The final photo: stamped, resized, JPEG encoded and hashed, ready for `proof-validate`. */
export type ProofPhoto = {
  bytes: Uint8Array;
  mimeType: 'image/jpeg';
  /** Read from the JPEG header, so it is what the server will read. */
  width: number;
  height: number;
  /** Lowercase hex SHA-256 of `bytes`. */
  sha256: string;
  /** ISO instant of the device clock when the frame was taken. */
  capturedAt: string;
};

declare const btoa: (data: string) => string; // browsers and Hermes have it; packages using this file have no DOM lib

/** A preview of the photo that stays in memory: nothing is written to disk (ADR-0007, section 16). */
export function photoDataUri(photo: Pick<ProofPhoto, 'bytes' | 'mimeType'>): string {
  let binary = '';
  // In pieces: spreading a whole photo into one call overflows the stack.
  for (let i = 0; i < photo.bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...photo.bytes.subarray(i, i + 0x8000));
  }
  return `data:${photo.mimeType};base64,${btoa(binary)}`;
}

export type PhotoErrorCode = 'not_ready' | 'too_small' | 'too_large' | 'encode_failed';

export class PhotoError extends Error {
  readonly code: PhotoErrorCode;
  constructor(code: PhotoErrorCode, message?: string) {
    super(message ?? code);
    this.name = 'PhotoError';
    this.code = code;
  }
}

type Size = { width: number; height: number };

/** Scales down so the long edge is at most `longEdge`. Never scales up. */
export function fitLongEdge(source: Size, longEdge: number): Size {
  const scale = Math.min(1, longEdge / Math.max(source.width, source.height));
  return { width: Math.round(source.width * scale), height: Math.round(source.height * scale) };
}

/** Width and height from the first SOF marker, or null when `bytes` is not a JPEG that has one. */
export function readJpegSize(bytes: Uint8Array): Size | null {
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff) return null;
  let i = 2;
  while (i + 3 < bytes.length) {
    if (bytes[i] !== 0xff) return null;
    const marker = bytes[i + 1]!;
    if (marker === 0xff) {
      i += 1; // fill byte
      continue;
    }
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) {
      i += 2; // markers without a length
      continue;
    }
    // SOF0 to SOF15, without DHT (C4), JPG (C8) and DAC (CC).
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      if (i + 8 >= bytes.length) return null;
      return {
        height: (bytes[i + 5]! << 8) | bytes[i + 6]!,
        width: (bytes[i + 7]! << 8) | bytes[i + 8]!,
      };
    }
    i += 2 + ((bytes[i + 2]! << 8) | bytes[i + 3]!);
  }
  return null;
}

export type EncodeStep = Size & { quality: number };

/**
 * Attempts in order: the target size at falling quality, then smaller sizes at the same qualities.
 * A smaller size is skipped when it would put an edge under `minEdgePx`.
 */
export function compressionPlan(target: Size, limits: PhotoLimits): EncodeStep[] {
  const qualities = [1, 0.85, 0.7].map((f) => Math.round(limits.quality * f * 100) / 100);
  const steps: EncodeStep[] = [];
  for (const scale of [1, 0.8, 0.64]) {
    const width = Math.round(target.width * scale);
    const height = Math.round(target.height * scale);
    if (scale < 1 && Math.min(width, height) < limits.minEdgePx) continue;
    for (const quality of qualities) steps.push({ width, height, quality });
  }
  return steps;
}

/**
 * Runs `encode` along `compressionPlan` until the JPEG fits `maxBytes`, then checks what the server
 * will check: the bytes are a complete JPEG and its edges are inside the limits. The platform supplies
 * `encode`; this holds the policy, so web and native cannot drift apart.
 */
export async function encodeWithinLimits(
  source: Size,
  limits: PhotoLimits,
  encode: (step: EncodeStep) => Promise<Uint8Array>,
): Promise<Size & { bytes: Uint8Array }> {
  const target = fitLongEdge(source, limits.longEdgePx);
  if (Math.min(target.width, target.height) < limits.minEdgePx) {
    throw new PhotoError('too_small', `${source.width}x${source.height} is under the minimum`);
  }
  for (const step of compressionPlan(target, limits)) {
    const bytes = await encode(step);
    if (bytes.length > limits.maxBytes) continue;
    const size = readJpegSize(bytes);
    const complete = bytes[bytes.length - 2] === 0xff && bytes[bytes.length - 1] === 0xd9;
    const inside = (n: number) => n >= limits.minEdgePx && n <= limits.maxEdgePx;
    if (!size || !complete || !inside(size.width) || !inside(size.height)) {
      throw new PhotoError('encode_failed', 'the encoder did not produce a JPEG inside the limits');
    }
    return { bytes, ...size };
  }
  throw new PhotoError('too_large');
}
