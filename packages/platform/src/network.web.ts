import { useSyncExternalStore } from 'react';

/** Same contract as the native one; the app does not bind it, React Query already reads these events. */
export function onConnectionChange(setOnline: (online: boolean) => void): () => void {
  const onChange = () => setOnline(navigator.onLine);
  globalThis.addEventListener('online', onChange);
  globalThis.addEventListener('offline', onChange);
  return () => {
    globalThis.removeEventListener('online', onChange);
    globalThis.removeEventListener('offline', onChange);
  };
}

export function useOnline(): boolean {
  return useSyncExternalStore(
    onConnectionChange,
    () => navigator.onLine,
    () => true,
  );
}
