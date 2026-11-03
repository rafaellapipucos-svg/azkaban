import { describe, expect, it, vi } from 'vitest';
import { onConnectionChange } from './network';

// A fake NetInfo that hands its listener to the test.
const net = vi.hoisted(() => ({
  listener: undefined as ((state: { isConnected: boolean | null }) => void) | undefined,
}));
vi.mock('@react-native-community/netinfo', () => ({
  default: {
    addEventListener: (listener: (state: { isConnected: boolean | null }) => void) => {
      net.listener = listener;
      return () => (net.listener = undefined);
    },
  },
  useNetInfo: () => ({ isConnected: null }),
}));

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
