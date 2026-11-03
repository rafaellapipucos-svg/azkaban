import { internalPathSchema } from '@azkaban/contracts';

/** What the Supabase redirect carries back into the app (ADR-0004, ADR-0012 section 11). */
export type SessionLink =
  | { kind: 'session'; accessToken: string; refreshToken: string; path: string }
  | { kind: 'error'; description: string; path: string };

// ponytail: by hand, not URLSearchParams: React Native's is incomplete and the link is untrusted.
function readParams(text: string) {
  const params = new Map<string, string>();
  for (const pair of text.split('&')) {
    const at = pair.indexOf('=');
    if (at <= 0) continue;
    try {
      const decode = (part: string) => decodeURIComponent(part.replace(/\+/g, ' '));
      params.set(decode(pair.slice(0, at)), decode(pair.slice(at + 1)));
    } catch {
      // A malformed escape is not a token.
    }
  }
  return params;
}

/**
 * Reads a sign-in link that opened the app. `appRoot` is the app's own `createAppLink('/')`
 * (`azkaban:///` in a build, `https://host` with no trailing slash on the web): any other scheme or
 * host is `null`, as is a link of the app without the Supabase parameters, which the router handles
 * on its own. The path never leaves the app.
 */
export function parseSessionLink(url: string, appRoot: string): SessionLink | null {
  // The slash ends the host: `https://host` alone would also match `https://host.evil.com`.
  const root = appRoot.endsWith('/') ? appRoot : `${appRoot}/`;
  if (!url.startsWith(root)) return null;
  const hashAt = url.indexOf('#');
  const beforeHash = hashAt === -1 ? url : url.slice(0, hashAt);
  const queryAt = beforeHash.indexOf('?');
  const rawPath = `/${(queryAt === -1 ? beforeHash : beforeHash.slice(0, queryAt)).slice(root.length)}`;
  const path = internalPathSchema.safeParse(rawPath).success ? rawPath : '/';
  const fragment = readParams(hashAt === -1 ? '' : url.slice(hashAt + 1));
  // GoTrue puts the error in the fragment, older versions in the query.
  const query = readParams(queryAt === -1 ? '' : beforeHash.slice(queryAt + 1));
  const error = fragment.get('error_description') ?? query.get('error_description');
  if (error !== undefined) return { kind: 'error', description: error, path };
  const accessToken = fragment.get('access_token');
  const refreshToken = fragment.get('refresh_token');
  if (!accessToken || !refreshToken) return null;
  return { kind: 'session', accessToken, refreshToken, path };
}

declare const atob: (data: string) => string; // browsers and Hermes have it; this package has no DOM lib

/**
 * The `sub` of an access token, unverified: only to tell whose session a link carries before
 * `setSession` checks it with GoTrue. `null` when it is not a readable JWT.
 */
export function tokenUserId(accessToken: string): string | null {
  try {
    const part = accessToken.split('.')[1]!.replace(/-/g, '+').replace(/_/g, '/');
    const payload: unknown = JSON.parse(atob(part.padEnd(Math.ceil(part.length / 4) * 4, '=')));
    const sub = (payload as { sub?: unknown } | null)?.sub;
    return typeof sub === 'string' ? sub : null;
  } catch {
    return null;
  }
}
