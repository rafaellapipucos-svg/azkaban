// `sessionStorage` lives with the tab and survives its reloads. It throws when storage is blocked,
// and then the value is simply not kept.

export function readSessionValue(key: string): string | null {
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

/** `null` removes it. */
export function writeSessionValue(key: string, value: string | null): void {
  try {
    if (value === null) sessionStorage.removeItem(key);
    else sessionStorage.setItem(key, value);
  } catch {
    // Blocked storage: a reload asks for the number again.
  }
}
