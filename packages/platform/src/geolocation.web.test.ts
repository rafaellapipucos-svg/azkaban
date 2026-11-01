import { afterEach, describe, expect, it, vi } from 'vitest';
import { getLocationPermission, readLocation } from './geolocation.web';

type Success = (position: { coords: Record<string, number> }) => void;
type Failure = (error: { code: number }) => void;

function stubBrowser(
  getCurrentPosition: (ok: Success, fail: Failure, options: object) => void,
  permissionState?: string,
) {
  vi.stubGlobal('navigator', {
    geolocation: { getCurrentPosition },
    permissions: {
      query: permissionState
        ? async () => ({ state: permissionState })
        : async () => {
            throw new TypeError('unsupported');
          },
    },
  });
}

afterEach(() => vi.unstubAllGlobals());

describe('readLocation (web)', () => {
  it('returns the fix with its accuracy and asks for a fresh high accuracy reading', async () => {
    let options: object = {};
    stubBrowser((ok, _fail, o) => {
      options = o;
      ok({ coords: { latitude: -23.5, longitude: -46.6, accuracy: 12 } });
    });
    expect(await readLocation({ timeoutMs: 5000 })).toEqual({
      status: 'ok',
      location: { lat: -23.5, lng: -46.6, accuracyM: 12 },
    });
    expect(options).toEqual({ enableHighAccuracy: true, timeout: 5000, maximumAge: 0 });
  });

  it.each([
    [1, 'denied'],
    [2, 'unavailable'],
    [3, 'timeout'],
  ])('maps the browser error %i to %s without throwing', async (code, status) => {
    stubBrowser((_ok, fail) => fail({ code }));
    expect(await readLocation()).toEqual({ status });
  });

  it('counts a reading without accuracy as none', async () => {
    stubBrowser((ok) => ok({ coords: { latitude: 1, longitude: 2, accuracy: 0 } }));
    expect(await readLocation()).toEqual({ status: 'unavailable' });
  });

  it('gives up when the browser never answers', async () => {
    vi.useFakeTimers();
    try {
      stubBrowser(() => undefined);
      const result = readLocation({ timeoutMs: 1000 });
      await vi.advanceTimersByTimeAsync(31_000);
      expect(await result).toEqual({ status: 'timeout' });
    } finally {
      vi.useRealTimers();
    }
  });

  it('reports a browser without geolocation as unavailable', async () => {
    vi.stubGlobal('navigator', {});
    expect(await readLocation()).toEqual({ status: 'unavailable' });
    expect(await getLocationPermission()).toBe('unavailable');
  });
});

describe('getLocationPermission (web)', () => {
  it('reads the state without asking', async () => {
    stubBrowser(() => undefined, 'denied');
    expect(await getLocationPermission()).toBe('denied');
  });

  it('falls back to prompt where the Permissions API cannot be queried', async () => {
    stubBrowser(() => undefined);
    expect(await getLocationPermission()).toBe('prompt');
  });
});
