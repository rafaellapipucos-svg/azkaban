import { ProfileScreen } from '@azkaban/feature-auth';
import { useTranslation } from '@azkaban/i18n';
import { Button } from '@azkaban/ui';
import { useRouter } from 'expo-router';

// Groups left the tab bar for the profile, so this route puts the entry point into the screen.
export default function Profile() {
  const { t } = useTranslation();
  const router = useRouter();
  return (
    <ProfileScreen>
      <Button variant="secondary" label={t('tabs.groups')} onPress={() => router.push('/groups')} />
    </ProfileScreen>
  );
}
