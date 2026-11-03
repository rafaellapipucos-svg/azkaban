// The checks of proof-validate that need no network (ADR-0007, sections 3, 5 and 7). No imports, so
// Node runs the unit tests of this file directly (checks.test.ts); the rules come in as arguments.

export type JpegInfo = { widthPx: number; heightPx: number };
export type JpegVerdict = JpegInfo | 'bad_type';

/** Start-of-frame markers. C4 (Huffman table), C8 (reserved) and CC (arithmetic table) are not frames. */
const isFrame = (marker: number) =>
  marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;

/**
 * Whether these bytes are a whole JPEG, without decoding it: it starts with FF D8 FF, ends with FF D9,
 * the segments up to the scan line up, and a frame header gives the size. Decoding is not worth the
 * CPU (a valid black picture passes the same way), so this proves the shape and nothing more.
 * `bad_type` is anything that is not that shape. A scan with no frame before it comes back as 0 by 0,
 * which fails the range like any other size.
 */
export function inspectJpeg(bytes: Uint8Array): JpegVerdict {
  const end = bytes.length;
  if (end < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff) return 'bad_type';
  if (bytes[end - 2] !== 0xff || bytes[end - 1] !== 0xd9) return 'bad_type';

  let at = 2;
  let frame: JpegInfo | null = null;
  while (at < end) {
    if (bytes[at] !== 0xff) return 'bad_type';
    // Any number of FF fill bytes may come before a marker.
    while (at < end && bytes[at] === 0xff) at += 1;
    if (at >= end) return 'bad_type';
    const marker = bytes[at]!;
    at += 1;
    // Standalone markers have no length: TEM, RSTn, SOI. EOI before the scan means no image.
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) continue;
    if (marker === 0xd9 || marker === 0x00) return 'bad_type';
    if (at + 2 > end) return 'bad_type';
    const length = (bytes[at]! << 8) | bytes[at + 1]!;
    if (length < 2 || at + length > end) return 'bad_type';
    if (isFrame(marker)) {
      // length, precision, height, width, components
      if (length < 8 || frame) return 'bad_type';
      frame = {
        heightPx: (bytes[at + 3]! << 8) | bytes[at + 4]!,
        widthPx: (bytes[at + 5]! << 8) | bytes[at + 6]!,
      };
    }
    // The scan comes after the frame, and everything after its header is entropy data.
    if (marker === 0xda) return frame ?? { widthPx: 0, heightPx: 0 };
    at += length;
  }
  return 'bad_type';
}

export const inRange = (edge: number, min: number, max: number) => edge >= min && edge <= max;

const EARTH_RADIUS_M = 6_371_000;
const toRadians = (degrees: number) => (degrees * Math.PI) / 180;

/** Great-circle distance in metres. */
export function haversineM(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const dLat = toRadians(b.lat - a.lat);
  const dLng = toRadians(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(a.lat)) * Math.cos(toRadians(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

export type Place = { lat: number; lng: number; radiusM: number };
export type Reading = { lat: number; lng: number; accuracyM: number };
export type LocationVerdict = {
  /** What the row keeps. The coordinates are not here and never leave this function. */
  distanceM: number | null;
  accuracyM: number | null;
  flags: ('out_of_radius' | 'location_missing')[];
  /** True when the rule is `block` and the proof would carry a location flag. */
  blocked: boolean;
};

/**
 * Section 7. Without a place on the context the claim is ignored altogether. Without a usable reading
 * the proof is `location_missing`. Outside the radius means the distance minus the accuracy is still
 * over it, so the imprecision favours the user. `block` refuses both flags, because otherwise refusing
 * the permission would be enough.
 */
export function judgeLocation(
  place: Place | null,
  reading: Reading | null,
  rules: { maxLocationAccuracyM: number; outOfRadius: string },
): LocationVerdict {
  if (!place) return { distanceM: null, accuracyM: null, flags: [], blocked: false };
  const block = rules.outOfRadius === 'block';
  if (!reading || reading.accuracyM > rules.maxLocationAccuracyM) {
    return {
      distanceM: null,
      accuracyM: reading ? Math.round(reading.accuracyM) : null,
      flags: ['location_missing'],
      blocked: block,
    };
  }
  const distance = haversineM(place, reading);
  const outside = distance - reading.accuracyM > place.radiusM;
  return {
    distanceM: Math.round(distance),
    accuracyM: Math.round(reading.accuracyM),
    flags: outside ? ['out_of_radius'] : [],
    blocked: block && outside,
  };
}

/** Section 5. Only the device time that falls outside [challenge issued, received] by more than the tolerance. */
export function clockMismatch(
  capturedAtMs: number,
  issuedAtMs: number,
  receivedAtMs: number,
  toleranceSeconds: number,
): boolean {
  const tolerance = toleranceSeconds * 1000;
  return capturedAtMs < issuedAtMs - tolerance || capturedAtMs > receivedAtMs + tolerance;
}

export function toHex(bytes: ArrayBuffer): string {
  return Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, '0')).join('');
}
