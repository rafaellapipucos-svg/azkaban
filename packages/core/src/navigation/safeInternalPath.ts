import { internalPathSchema } from '@azkaban/contracts';

/** Returns `path` only when it stays inside the app; it comes from the URL, so it is untrusted. */
export function safeInternalPath(path: string | undefined) {
  return path !== undefined && internalPathSchema.safeParse(path).success ? path : undefined;
}
