import { defaults } from '@azkaban/config';
import { storage } from '@azkaban/platform';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './database.types';

let client: SupabaseClient<Database> | undefined;
let apiUrl = '';

type Fetch = typeof fetch;

const wait = (ms: number, signal?: AbortSignal | null) =>
  new Promise<void>((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason);
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal?.reason);
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });

/**
 * Sends a `/functions/v1/` request again on 503, which means the function never ran (ADR-0012,
 * section 18), after each of `delays`. Any other URL, status or a network error goes back as is.
 */
export function functionRetryFetch(
  url: string,
  base: Fetch = (...args) => fetch(...args),
  delays: readonly number[] = defaults.functionRetryDelaysMs,
): Fetch {
  // Built like supabase-js builds `functionsUrl`, so the normalized forms match.
  const prefix = new URL('functions/v1/', url.endsWith('/') ? url : `${url}/`).href;
  return async (input, init) => {
    let response = await base(input, init);
    // ponytail: supabase-js calls with a string; a `Request` (its body may be spent) is never sent again.
    if (typeof input !== 'string' || !input.startsWith(prefix)) return response;
    // A stream reads once, so a request carrying one is never sent again. Duck-typed: React
    // Native's types have no `ReadableStream`.
    const body = init?.body as { getReader?: unknown } | null | undefined;
    if (typeof body?.getReader === 'function') return response;
    for (const delay of delays) {
      if (response.status !== 503) break;
      await wait(delay, init?.signal);
      response = await base(input, init);
    }
    return response;
  };
}

export function initData(url: string, publishableKey: string) {
  apiUrl = url;
  client = createClient<Database>(url, publishableKey, {
    // BL-38: never reads a sign-in link itself, the web neither. `authRepository.setSessionFromLink`
    // does, so a link never swaps another account's active session.
    auth: { storage, detectSessionInUrl: false },
    global: { fetch: functionRetryFetch(url) },
  });
}

export function db() {
  if (!client) throw new Error('initData must run before any repository call');
  return client;
}

/** The address this device reaches the API at. */
export const publicApiUrl = () => apiUrl;

export async function currentUserId() {
  const { data } = await db().auth.getSession();
  if (!data.session) throw new Error('not_authenticated');
  return data.session.user.id;
}
