import NetInfo, { useNetInfo } from '@react-native-community/netinfo';

/**
 * Whether the device says it has a connection, from NetInfo. Web reads the browser, in
 * `network.web.ts`, which Metro picks there. `null` (not known yet) counts as online, so the offline
 * queue does not pause on launch.
 */
export function useOnline(): boolean {
  return useNetInfo().isConnected !== false;
}

/**
 * Calls back on every connection change and returns the unsubscribe. Shaped for React Query's
 * `onlineManager.setEventListener`, which the app wires up on native only; on the web the
 * onlineManager already listens to the browser.
 */
export function onConnectionChange(setOnline: (online: boolean) => void): () => void {
  return NetInfo.addEventListener((state) => setOnline(state.isConnected !== false));
}
