// Pieces the proof functions share (ADR-0007). Nothing here logs: each function decides what its own
// log lines say. The service role client is created here only from the runtime's own environment.
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { timingSafeEqual } from 'node:crypto';

export const clientOptions = { auth: { persistSession: false, autoRefreshToken: false } };

/** `extraHeaders` are the request headers a browser may send besides the usual ones. */
export function responder(extraHeaders: string[] = []) {
  const headers = {
    'access-control-allow-origin': '*',
    'access-control-allow-headers': [
      'authorization',
      'x-client-info',
      'apikey',
      'content-type',
      ...extraHeaders,
    ].join(', '),
    'access-control-allow-methods': 'POST, OPTIONS',
    'content-type': 'application/json',
  };
  return (status: number, body: unknown) =>
    new Response(status === 204 ? null : JSON.stringify(body), { status, headers });
}

export function serviceClient(): SupabaseClient {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    clientOptions,
  );
}

/** Both digests have the same length, which timingSafeEqual needs, so the secret's length does not leak. */
export async function sameSecret(given: string, expected: string): Promise<boolean> {
  const digest = async (text: string) =>
    new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));
  return timingSafeEqual(await digest(given), await digest(expected));
}

/** The signed-in user of the request, or null. An anon key or a service key is a JWT without a user. */
export async function signedInUser(admin: SupabaseClient, authorization: string) {
  if (!authorization.startsWith('Bearer ')) return null;
  const token = authorization.slice(7);
  const { data, error } = await admin.auth.getUser(token);
  return error || !data.user ? null : { id: data.user.id, token };
}
