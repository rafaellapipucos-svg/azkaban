import { useTranslation } from '@azkaban/i18n';
import { IconButton } from '@azkaban/ui';
import { useRouter } from 'expo-router';
import { useUnreadCount } from './hooks';

/** The bell for a screen header. The count is in the label too, because the badge is not read aloud. */
export function NotificationBell() {
  const { t } = useTranslation('notifications');
  const router = useRouter();
  const count = useUnreadCount();
  return (
    <IconButton
      icon="🔔"
      label={t('bell.label', { count })}
      badge={count}
      onPress={() => router.push('/notifications')}
    />
  );
}
