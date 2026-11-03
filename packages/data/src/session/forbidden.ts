import type { QueryClient, QueryKey } from '@tanstack/react-query';

// What `can()` reads (the own memberships in `['groups']`) and the roles the group screens show.
const roleKeys = ['groups', 'group-members'];

/**
 * A refusal by the server: an RPC's `forbidden` (ADR-0005), at any depth of `cause`, as the
 * repositories wrap it, or SQLSTATE 42501, which is what RLS answers to a write it does not allow.
 */
export function isForbidden(error: unknown): boolean {
  // ponytail: five levels of `cause` are more than any repository wraps.
  for (let at = error, depth = 0; typeof at === 'object' && at !== null && depth < 5; depth++) {
    const { code, message, cause } = at as { code?: unknown; message?: unknown; cause?: unknown };
    if (code === 'forbidden' || code === '42501' || message === 'forbidden') return true;
    at = cause;
  }
  return false;
}

/**
 * On any server refusal, reads the roles again: someone else may have changed them, and `can()`
 * would show the cached ones for up to `currentUserStaleMs` (BL-16). One place for every module,
 * the cache's own events, so no repository needs the client. A failure of the role reads themselves
 * does not count, or it would loop. Returns the unsubscribe.
 */
export function refreshRolesOnForbidden(client: QueryClient) {
  const refresh = (error: unknown, failedKey?: QueryKey) => {
    if (!isForbidden(error) || roleKeys.includes(String(failedKey?.[0]))) return;
    for (const key of roleKeys) void client.invalidateQueries({ queryKey: [key] });
  };
  const offQueries = client.getQueryCache().subscribe((event) => {
    if (event.type === 'updated' && event.action.type === 'error')
      refresh(event.action.error, event.query.queryKey);
  });
  const offMutations = client.getMutationCache().subscribe((event) => {
    if (event.type === 'updated' && event.action.type === 'error') refresh(event.action.error);
  });
  return () => {
    offQueries();
    offMutations();
  };
}
