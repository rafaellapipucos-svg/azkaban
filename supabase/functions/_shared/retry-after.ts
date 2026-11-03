// No imports, so Node runs the tests of both channels that use it (Web Push and WhatsApp).

/** Seconds of a `Retry-After`, in either form, or undefined. */
export function retryAfterSeconds(header: string | null, nowMs: number): number | undefined {
  if (!header) return undefined;
  if (/^\d+$/.test(header.trim())) return Number(header.trim());
  const at = Date.parse(header);
  return Number.isNaN(at) ? undefined : Math.max(0, Math.ceil((at - nowMs) / 1000));
}
