/** Returns `path` only when it stays inside the app; it comes from the URL, so it is untrusted. */
export function safeInternalPath(path: string | undefined) {
  if (!path || !/^\/[^/\\]/.test(path) || path.includes('\\')) return undefined;
  return path;
}
