import { PrivacyScreen } from '@azkaban/feature-auth';
import { useTranslation } from '@azkaban/i18n';
import { Button } from '@azkaban/ui';
import { useRouter } from 'expo-router';

// The notification and WhatsApp preferences belong to another module: the route links to them.
export default function PrivacySettings() {
  const { t } = useTranslation();
  const router = useRouter();
  return (
    <PrivacyScreen>
      <Button
        variant="secondary"
        label={t('notifications:preferences.title')}
        onPress={() => router.push('/settings/notifications')}
      />
    </PrivacyScreen>
  );
}
