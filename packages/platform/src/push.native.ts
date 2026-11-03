import { features } from '@azkaban/config';
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import type { PushPermission, PushSubscriptionData, PushSupport } from './push';

export type { PushPermission, PushSubscriptionData, PushSupport } from './push';

/**
 * Native push (ADR-0012, section 11), behind `features.nativePush`. There is no Web Push here, so the
 * Web Push functions answer "unsupported"; the device is reached by its Expo token instead, which
 * the server can only store once `push_subscriptions` has a kind (backend-funcoes, banco-de-dados).
 */
export function pushSupport(): PushSupport {
  return 'unsupported';
}

export function pushPermission(): PushPermission {
  return 'denied';
}

export async function subscribePush(vapidPublicKey: string): Promise<PushSubscriptionData | null> {
  void vapidPublicKey;
  return null;
}

export async function currentPushSubscription(
  vapidPublicKey: string,
): Promise<PushSubscriptionData | null> {
  void vapidPublicKey;
  return null;
}

export async function unsubscribePush(): Promise<void> {}

const androidChannelId = 'default';

export async function nativePushToken(androidChannelName: string): Promise<string | null> {
  const eas = Constants.expoConfig?.extra?.eas as { projectId?: string } | undefined;
  const projectId = eas?.projectId;
  if (!features.nativePush || !projectId) return null;
  // Android 13 and later show the permission prompt only once a channel exists.
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(androidChannelId, {
      name: androidChannelName,
      importance: Notifications.AndroidImportance.HIGH,
    });
  }
  const current = await Notifications.getPermissionsAsync();
  const { granted } = current.granted ? current : await Notifications.requestPermissionsAsync();
  if (!granted) return null;
  try {
    return (await Notifications.getExpoPushTokenAsync({ projectId })).data;
  } catch {
    // A simulator, or Android without the FCM credentials in EAS yet.
    return null;
  }
}

export function onPushOpened(listener: (url: string) => void): () => void {
  const open = (response: Notifications.NotificationResponse | null) => {
    const url = response?.notification.request.content.data?.url;
    if (typeof url === 'string') listener(url);
  };
  // The tap that opened a closed app arrives before any listener; cleared so it opens only once.
  open(Notifications.getLastNotificationResponse());
  Notifications.clearLastNotificationResponse();
  const subscription = Notifications.addNotificationResponseReceivedListener(open);
  return () => subscription.remove();
}
