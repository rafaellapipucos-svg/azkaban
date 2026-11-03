/**
 * A small value that lives as long as the tab: `sessionStorage` on web, in `sessionValue.web.ts`.
 * Native keeps it in memory, because the app is not reloaded when the person switches apps.
 */
const values = new Map<string, string>();

export function readSessionValue(key: string): string | null {
  return values.get(key) ?? null;
}

/** `null` removes it. */
export function writeSessionValue(key: string, value: string | null): void {
  if (value === null) values.delete(key);
  else values.set(key, value);
}
