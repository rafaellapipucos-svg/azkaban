import { NotificationPreferencesScreen } from '@azkaban/feature-notifications';
import { env } from '../../../src/env';

export default function NotificationSettings() {
  return <NotificationPreferencesScreen vapidPublicKey={env.EXPO_PUBLIC_VAPID_PUBLIC_KEY} />;
}
