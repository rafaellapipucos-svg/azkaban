import { features } from '@azkaban/config';
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import type {
  AndroidPushChannel,
  NativePushTokenData,
  PushPermission,
  PushSubscriptionData,
  PushSupport,
} from './push';

export type {
  AndroidPushChannel,
  NativePushTokenData,
  PushPermission,
  PushSubscriptionData,
  PushSupport,
} from './push';

/**
 * Native push (ADR-0012, section 11), behind `features.nativePush`. There is no Web Push here: the
 * device is reached by its Expo token, from `nativePushToken`. The Web Push functions answer null.
 */
const projectId = () =>
  (Constants.expoConfig?.extra?.eas as { projectId?: string } | undefined)?.projectId;

const fromStatus = (status: Notifications.PermissionStatus): PushPermission =>
  status === Notifications.PermissionStatus.GRANTED
    ? 'granted'
    : status === Notifications.PermissionStatus.DENIED
      ? 'denied'
      : 'default';

// ponytail: the system only, which `deviceLabel` in core reads; `expo-device` if the model matters.
const deviceName = () => {
  if (Platform.OS === 'android') return 'Android';
  return Platform.OS === 'ios' && Platform.isPad ? 'iPad' : 'iPhone';
};

// `pushPermission` is synchronous and the OS answers async: the last answer, read once at start.
let permission: PushPermission = 'default';
if (features.nativePush && projectId()) {
  void Notifications.getPermissionsAsync()
    .then(({ status }) => (permission = fromStatus(status)))
    .catch(() => undefined);
}

/** Without the flag or the EAS project id, nothing changes: the card says "unsupported". */
export function pushSupport(): PushSupport {
  return features.nativePush && projectId() ? 'supported' : 'unsupported';
}

export function pushPermission(): PushPermission {
  return pushSupport() === 'supported' ? permission : 'denied';
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

export async function nativePushToken(
  channel: AndroidPushChannel,
): Promise<NativePushTokenData | null> {
  if (!features.nativePush) return null;
  const id = projectId();
  if (!id) {
    // No EAS project yet (BL-29): no Expo token to ask for, so no permission prompt either.
    console.warn(
      'nativePush: extra.eas.projectId is missing in the app config; native push is off.',
    );
    return null;
  }
  // Android 13 and later show the permission prompt only once a channel exists.
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(channel.id, {
      name: channel.name,
      importance: Notifications.AndroidImportance.HIGH,
    });
  }
  const current = await Notifications.getPermissionsAsync();
  const answer = current.granted ? current : await Notifications.requestPermissionsAsync();
  permission = fromStatus(answer.status);
  if (!answer.granted) return null;
  try {
    const { data } = await Notifications.getExpoPushTokenAsync({ projectId: id });
    return { token: data, userAgent: deviceName() };
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
