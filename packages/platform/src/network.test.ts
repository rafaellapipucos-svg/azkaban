import { describe, expect, it, vi } from 'vitest';
import { onConnectionChange } from './network';

// A fake NetInfo that hands its listener and its `configure` calls to the test. A plain array, not
// `vi.fn()`: Vitest clears mock calls before each test, and `configure` runs once, on import.
const net = vi.hoisted(() => ({
  listener: undefined as ((state: { isConnected: boolean | null }) => void) | undefined,
  configured: [] as { reachabilityShouldRun: () => boolean }[],
}));
vi.mock('@react-native-community/netinfo', () => ({
  default: {
    configure: (config: { reachabilityShouldRun: () => boolean }) => net.configured.push(config),
    addEventListener: (listener: (state: { isConnected: boolean | null }) => void) => {
      net.listener = listener;
      return () => (net.listener = undefined);
    },
  },
  useNetInfo: () => ({ isConnected: null }),
}));

describe('NetInfo setup (native)', () => {
  it('turns off the reachability check against a third party once, on import', () => {
    expect(net.configured).toHaveLength(1);
    expect(net.configured[0]?.reachabilityShouldRun()).toBe(false);
  });
});

describe('onConnectionChange (native)', () => {
  it('reports NetInfo changes, counting "not known yet" as online, and unsubscribes', () => {
    const seen: boolean[] = [];
    const stop = onConnectionChange((online) => seen.push(online));
    net.listener?.({ isConnected: null });
    net.listener?.({ isConnected: false });
    net.listener?.({ isConnected: true });
    expect(seen).toEqual([true, false, true]);
    stop();
    expect(net.listener).toBeUndefined();
  });
});
