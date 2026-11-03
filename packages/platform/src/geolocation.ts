import {
  Accuracy,
  getCurrentPositionAsync,
  getForegroundPermissionsAsync,
  hasServicesEnabledAsync,
  requestForegroundPermissionsAsync,
} from 'expo-location';

export type LocationPermission = 'prompt' | 'granted' | 'denied' | 'unavailable';

/** Same shape as `ProofLocation` in the contracts: the platform package does not depend on them. */
export type DeviceLocation = { lat: number; lng: number; accuracyM: number };

export type LocationResult =
  { status: 'ok'; location: DeviceLocation } | { status: 'denied' | 'unavailable' | 'timeout' };

export type ReadLocationOptions = {
  /** Time to get a fix once the permission is settled. Default 10 s. */
  timeoutMs?: number;
};

const defaultLocationTimeoutMs = 10_000;

/** Current state of the permission, without asking. Call it to decide whether to show your explanation first. */
export async function getLocationPermission(): Promise<LocationPermission> {
  try {
    if (!(await hasServicesEnabledAsync())) return 'unavailable';
    const p = await getForegroundPermissionsAsync();
    if (p.granted) return 'granted';
    return p.status === 'denied' && !p.canAskAgain ? 'denied' : 'prompt';
  } catch {
    return 'unavailable';
  }
}

/**
 * One reading, never a watch. It asks for the permission when the system still can, so call it only
 * after the user agreed to the explanation. It never throws: every failure is a `status`, and the
 * caller carries on without a location.
 */
export async function readLocation(options: ReadLocationOptions = {}): Promise<LocationResult> {
  const timeoutMs = options.timeoutMs ?? defaultLocationTimeoutMs;
  try {
    if (!(await hasServicesEnabledAsync())) return { status: 'unavailable' };
    let p = await getForegroundPermissionsAsync();
    if (!p.granted && p.canAskAgain) p = await requestForegroundPermissionsAsync();
    if (!p.granted) return { status: 'denied' };
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<'timeout'>((resolve) => {
      timer = setTimeout(() => resolve('timeout'), timeoutMs);
    });
    const fix = getCurrentPositionAsync({ accuracy: Accuracy.High });
    fix.catch(() => undefined); // a fix that fails after the timeout must not go unhandled
    const result = await Promise.race([fix, timeout]).finally(() => clearTimeout(timer));
    if (result === 'timeout') return { status: 'timeout' };
    const { latitude, longitude, accuracy } = result.coords;
    // Without an accuracy the server could not weigh the reading, so it counts as none.
    if (accuracy == null || accuracy <= 0) return { status: 'unavailable' };
    return { status: 'ok', location: { lat: latitude, lng: longitude, accuracyM: accuracy } };
  } catch {
    return { status: 'unavailable' };
  }
}
