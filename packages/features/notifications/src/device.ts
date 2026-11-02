import { notificationErrorCode, notificationsRepository } from '@azkaban/data';
import {
  currentPushSubscription,
  storage,
  subscribePush,
  unsubscribePush,
} from '@azkaban/platform';
import { notificationsConfig } from './config';

/**
 * Which account turned push on in this browser, and the row it got. The browser keeps its
 * subscription across sign-outs, so this is what keeps a second account from inheriting it.
 */
type ThisDevice = { userId: string; deviceId: string };

async function read(): Promise<ThisDevice | null> {
  const raw = await storage.getItem(notificationsConfig.thisDeviceKey);
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<ThisDevice>;
    return value.userId && value.deviceId
      ? { userId: value.userId, deviceId: value.deviceId }
      : null;
  } catch {
    return null;
  }
}

const remember = (value: ThisDevice) =>
  storage.setItem(notificationsConfig.thisDeviceKey, JSON.stringify(value));
const clear = () => storage.removeItem(notificationsConfig.thisDeviceKey);

/** The row of this browser, when the current account turned push on here. */
export async function thisDeviceId(userId: string) {
  const device = await read();
  return device?.userId === userId ? device.deviceId : null;
}

export type EnableResult = 'enabled' | 'dismissed' | 'not_allowed' | 'failed';

/** From a tap only: it asks for the permission. */
export async function enableThisDevice(
  userId: string,
  vapidPublicKey: string,
): Promise<EnableResult> {
  try {
    const subscription = await subscribePush(vapidPublicKey);
    if (!subscription) return 'dismissed';
    await remember({
      userId,
      deviceId: await notificationsRepository.registerDevice(subscription),
    });
    return 'enabled';
  } catch (error) {
    if (notificationErrorCode(error) !== 'push_endpoint_not_allowed') return 'failed';
    // A push service outside the list: this browser cannot be used, so it keeps nothing.
    await unsubscribePush().catch(() => undefined);
    return 'not_allowed';
  }
}

/**
 * On every open (ADR-0008, section 9): registers the current subscription again, which covers one the
 * browser renewed and a key that changed. Another account's subscription is dropped, never adopted.
 */
export async function syncThisDevice(userId: string, vapidPublicKey: string) {
  const device = await read();
  if (!device) return;
  if (device.userId !== userId) {
    await unsubscribePush();
    await clear();
    return;
  }
  const subscription = await currentPushSubscription(vapidPublicKey);
  if (!subscription) return;
  const deviceId = await notificationsRepository.registerDevice(subscription);
  if (deviceId !== device.deviceId) await remember({ userId, deviceId });
}

/** Stops push in this browser and deletes its row. Call it before signing out, with the session alive. */
export async function forgetThisDevice() {
  const device = await read();
  if (device) await notificationsRepository.removeDevice(device.deviceId).catch(() => undefined);
  await unsubscribePush().catch(() => undefined);
  await clear();
}
