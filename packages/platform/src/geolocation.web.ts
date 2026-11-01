// Types only: at run time Metro resolves './geolocation' to this very file on web.
import type { LocationPermission, LocationResult, ReadLocationOptions } from './geolocation';

const defaultLocationTimeoutMs = 10_000;

// Browsers only start the timeout after the user answers the prompt, and some never call back when
// it is dismissed. This is how long the prompt may stay open before the reading is given up.
const promptGraceMs = 30_000;

export async function getLocationPermission(): Promise<LocationPermission> {
  if (!globalThis.navigator?.geolocation) return 'unavailable';
  try {
    const { state } = await navigator.permissions.query({ name: 'geolocation' });
    return state;
  } catch {
    return 'prompt'; // Safari older than 16 has no Permissions API for it
  }
}

export function readLocation(options: ReadLocationOptions = {}): Promise<LocationResult> {
  const timeoutMs = options.timeoutMs ?? defaultLocationTimeoutMs;
  return new Promise((resolve) => {
    if (!globalThis.navigator?.geolocation) return resolve({ status: 'unavailable' });
    const timer = setTimeout(() => resolve({ status: 'timeout' }), timeoutMs + promptGraceMs);
    const done = (result: LocationResult) => {
      clearTimeout(timer);
      resolve(result);
    };
    try {
      navigator.geolocation.getCurrentPosition(
        ({ coords }) =>
          done(
            coords.accuracy > 0
              ? {
                  status: 'ok',
                  location: {
                    lat: coords.latitude,
                    lng: coords.longitude,
                    accuracyM: coords.accuracy,
                  },
                }
              : { status: 'unavailable' },
          ),
        (error) =>
          done({
            status: error.code === 1 ? 'denied' : error.code === 3 ? 'timeout' : 'unavailable',
          }),
        { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 0 },
      );
    } catch {
      done({ status: 'unavailable' });
    }
  });
}
