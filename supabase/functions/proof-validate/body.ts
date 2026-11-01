// Reads a request body without ever holding more than the limit (ADR-0007, section 3, step 4). No
// imports, so Node runs the unit tests (body.test.ts). `req.arrayBuffer()` would buffer all of it before
// the limit could say no, and Content-Length is a claim: it can be absent, or lie.

export type BodyResult =
  | { kind: 'ok'; bytes: Uint8Array }
  | { kind: 'too_large' }
  | { kind: 'timeout' }
  | { kind: 'aborted' };

/**
 * One buffer of `maxBytes + 1` is allocated up front, so the chunks are copied once and the byte that
 * crosses the limit is the one that stops the read. The stream is cancelled on every way out except
 * success, which tells the sender to stop.
 */
export async function readLimited(
  body: ReadableStream<Uint8Array> | null,
  maxBytes: number,
  timeoutMs: number,
): Promise<BodyResult> {
  if (!body) return { kind: 'ok', bytes: new Uint8Array(0) };
  const reader = body.getReader();
  const buffer = new Uint8Array(maxBytes + 1);
  let length = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const expired = new Promise<'timeout'>((resolve) => {
    timer = setTimeout(() => resolve('timeout'), timeoutMs);
  });
  try {
    for (;;) {
      const step = await Promise.race([reader.read(), expired]);
      if (step === 'timeout') return { kind: 'timeout' };
      if (step.done) return { kind: 'ok', bytes: buffer.subarray(0, length) };
      if (length + step.value.length > maxBytes) return { kind: 'too_large' };
      buffer.set(step.value, length);
      length += step.value.length;
    }
  } catch {
    return { kind: 'aborted' };
  } finally {
    clearTimeout(timer);
    // Cancelling a finished stream is harmless. The promise is not awaited: a stalled sender would
    // hold the answer for as long as it likes.
    reader.cancel().catch(() => {});
  }
}
