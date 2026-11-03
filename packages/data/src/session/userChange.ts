import type { QueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';

/** True when the cache was filled for someone else: the user left (`null`) or another one came in. */
export function cacheBelongsToAnother(previous: string | null, next: string | null) {
  return previous !== null && previous !== next;
}

/**
 * Empties the queries when the session's user changes by any path, not only the sign-out button
 * (a revoked refresh token ends it too). With `useCurrentUser` fresh for a minute, the next account
 * would see the last one's profile and groups otherwise. Mutations stay: the offline queue takes
 * its own out of memory. Mount once, in the root layout, with the app's client.
 */
export function useClearCacheOnUserChange(client: QueryClient, userId: string | null) {
  const last = useRef<string | null>(null);
  useEffect(() => {
    // Reset, not clear: a screen still mounted is told and refetches as the new user.
    if (cacheBelongsToAnother(last.current, userId)) void client.resetQueries();
    last.current = userId;
  }, [client, userId]);
}
