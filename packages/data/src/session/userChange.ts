import type { QueryClient } from '@tanstack/react-query';
import { useState } from 'react';

/** True when the cache was filled for someone else: the user left (`null`) or another one came in. */
export function cacheBelongsToAnother(previous: string | null, next: string | null) {
  return previous !== null && previous !== next;
}

/**
 * Empties the queries when the session's user changes by any path, not only the sign-out button
 * (a revoked refresh token ends it too), and returns a number that changes with it. Key the tree
 * under the client with it: every screen mounts again on the empty cache, so none draws, or
 * writes to the device, the last account's data (SEG8-2P-2). It runs in the render, before any
 * child; an effect would run after theirs. Mutations stay: the offline queue takes its own out of
 * memory. Mount once, in the root layout, with the app's client.
 */
export function useClearCacheOnUserChange(client: QueryClient, userId: string | null) {
  const [seen, setSeen] = useState({ userId, generation: 0 });
  if (seen.userId === userId) return seen.generation;
  const changed = cacheBelongsToAnother(seen.userId, userId);
  // ponytail: a side effect in the render, but idempotent; React's "state from the last render".
  if (changed) client.getQueryCache().clear();
  const generation = seen.generation + (changed ? 1 : 0);
  setSeen({ userId, generation });
  return generation;
}
