import { ProfileScreen } from '@azkaban/feature-auth';
import { forgetThisDevice } from '@azkaban/feature-notifications';
import { useTranslation } from '@azkaban/i18n';
import { Button } from '@azkaban/ui';
import { useRouter } from 'expo-router';

// Groups left the tab bar for the profile, so this route puts the entry points into the screen.
export default function Profile() {
  const { t } = useTranslation();
  const router = useRouter();
  return (
    <ProfileScreen onBeforeSignOut={forgetThisDevice}>
      <Button variant="secondary" label={t('tabs.groups')} onPress={() => router.push('/groups')} />
      <Button
        variant="secondary"
        label={t('notifications:preferences.title')}
        onPress={() => router.push('/settings/notifications')}
      />
    </ProfileScreen>
  );
}
