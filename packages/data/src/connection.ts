import { isWeb, onConnectionChange } from '@azkaban/platform';
import { onlineManager } from '@tanstack/react-query';

/**
 * Native only: the offline queue (ADR-0012, section 5) pauses on what NetInfo says. On the web the
 * onlineManager already reads the browser's `online`/`offline` events. Once, at startup.
 */
export function followDeviceConnection() {
  if (!isWeb) onlineManager.setEventListener(onConnectionChange);
}
