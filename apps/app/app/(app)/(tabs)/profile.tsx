import { ProfileScreen } from '@azkaban/feature-auth';
import { ProgressPanel } from '@azkaban/feature-gamification';
import { forgetThisDevice } from '@azkaban/feature-notifications';
import { useTranslation } from '@azkaban/i18n';
import { Button } from '@azkaban/ui';
import { useRouter } from 'expo-router';

// Groups left the tab bar for the profile, so this route puts the progress (on top, in view at
// 320 px, QA6-4) and the entry points into the screen.
export default function Profile() {
  const { t } = useTranslation();
  const router = useRouter();
  return (
    <ProfileScreen top={<ProgressPanel />} onBeforeSignOut={forgetThisDevice}>
      <Button variant="secondary" label={t('tabs.groups')} onPress={() => router.push('/groups')} />
      <Button
        variant="secondary"
        label={t('notifications:preferences.title')}
        onPress={() => router.push('/settings/notifications')}
      />
      <Button
        variant="secondary"
        label={t('auth:profile.privacy')}
        onPress={() => router.push('/settings/privacy')}
      />
    </ProfileScreen>
  );
}
