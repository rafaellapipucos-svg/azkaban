// Builds valid baseline JPEG files for the tests, so no binary lives in the repository. A grey picture:
// one component, one quantization table of ones, Huffman tables with a single code each (DC category 0
// and AC end-of-block), so every 8x8 block is two zero bits. A real decoder opens it (GDI+ reads
// 640x480, 333x321 and 2048x2048 as mid grey). The proof functions never decode, so what they judge is
// the structure, and every test gets bytes of its own through a comment segment, which the unique
// hash of task_proofs requires.

const word = (n: number) => [(n >> 8) & 0xff, n & 0xff];

/** A COM segment of `payload` bytes (at most 65533). */
export function commentSegment(payload: Uint8Array): Uint8Array {
  if (payload.length > 65533) throw new Error('segment too large');
  return Uint8Array.from([0xff, 0xfe, ...word(payload.length + 2), ...payload]);
}

export function makeJpeg(options: {
  widthPx: number;
  heightPx: number;
  /** Text stored in a comment, which changes the hash. */
  salt?: string;
  /** Pads with comment segments to exactly this many bytes. */
  totalBytes?: number;
}): Uint8Array {
  const { widthPx, heightPx } = options;
  const blocks = Math.ceil(widthPx / 8) * Math.ceil(heightPx / 8);
  // Two bits per block, padded with ones to a whole byte. The zero bits never form 0xFF.
  const scanBytes = Math.ceil((blocks * 2) / 8);
  const scan = new Uint8Array(scanBytes);
  const pad = scanBytes * 8 - blocks * 2;
  if (pad > 0) scan[scanBytes - 1] = (1 << pad) - 1;

  const huffman = (tableClass: number) => [
    0xff,
    0xc4,
    ...word(2 + 1 + 16 + 1),
    tableClass,
    1,
    ...new Array(15).fill(0),
    0,
  ];
  const parts: number[][] = [
    [0xff, 0xd8],
    [0xff, 0xdb, ...word(67), 0, ...new Array(64).fill(1)],
    [0xff, 0xc0, ...word(11), 8, ...word(heightPx), ...word(widthPx), 1, 1, 0x11, 0],
    huffman(0x00),
    huffman(0x10),
    [0xff, 0xda, ...word(8), 1, 1, 0x00, 0, 63, 0],
  ];
  const head = Uint8Array.from(parts.flat());
  const salt = new TextEncoder().encode(options.salt ?? '');
  const comment = salt.length > 0 ? commentSegment(salt) : new Uint8Array(0);

  // The comment goes right after SOI, ahead of every other segment.
  const out: number[] = [
    ...head.subarray(0, 2),
    ...comment,
    ...head.subarray(2),
    ...scan,
    0xff,
    0xd9,
  ];
  if (options.totalBytes === undefined) return Uint8Array.from(out);

  let missing = options.totalBytes - out.length;
  if (missing < 0 || (missing > 0 && missing < 4)) throw new Error('cannot pad to that size');
  const whole = Uint8Array.from(out);
  const segments: Uint8Array[] = [whole.subarray(0, 2)];
  while (missing > 0) {
    // A COM segment costs 4 bytes besides its payload, and a remainder of 1 to 3 bytes could not be filled.
    let payload = Math.min(missing - 4, 65533);
    const left = missing - (payload + 4);
    if (left > 0 && left < 4) payload -= 4;
    segments.push(commentSegment(new Uint8Array(payload).fill(0x41)));
    missing -= payload + 4;
  }
  segments.push(whole.subarray(2));
  const padded = new Uint8Array(options.totalBytes);
  let at = 0;
  for (const segment of segments) {
    padded.set(segment, at);
    at += segment.length;
  }
  return padded;
}
