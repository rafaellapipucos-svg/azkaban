import { onlineManager } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { followDeviceConnection } from './connection';

// A fake NetInfo: the test holds the listener the app would get from the device.
const net = vi.hoisted(() => ({
  isWeb: false,
  listener: undefined as ((online: boolean) => void) | undefined,
}));
vi.mock('@azkaban/platform', () => ({
  get isWeb() {
    return net.isWeb;
  },
  onConnectionChange: (setOnline: (online: boolean) => void) => {
    net.listener = setOnline;
    return () => (net.listener = undefined);
  },
}));

afterEach(() => {
  onlineManager.setOnline(true);
  net.listener = undefined;
});

describe('followDeviceConnection', () => {
  it('on native, makes the onlineManager follow what NetInfo reports', () => {
    followDeviceConnection();
    expect(net.listener).toBeDefined();
    net.listener?.(false);
    expect(onlineManager.isOnline()).toBe(false);
    net.listener?.(true);
    expect(onlineManager.isOnline()).toBe(true);
  });

  it('on the web, leaves the browser events React Query already uses', () => {
    net.isWeb = true;
    followDeviceConnection();
    expect(net.listener).toBeUndefined();
    net.isWeb = false;
  });
});
