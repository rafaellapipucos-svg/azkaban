import { useTranslation } from '@azkaban/i18n';
import { Button, Mascot, Muted, Screen, Title } from '@azkaban/ui';
import { useRouter } from 'expo-router';
import { Text, View } from 'react-native';

export function WelcomeScreen({ appName }: { appName: string }) {
  const { t } = useTranslation('auth');
  const router = useRouter();
  return (
    <Screen title={t('welcome.screenTitle')}>
      <View className="flex-1 items-center justify-center gap-4">
        <Mascot mood="happy" size={160} />
        <Text className="font-heavy text-md text-primary dark:text-primary-light">{appName}</Text>
        <Title className="text-center">{t('welcome.title')}</Title>
        <Muted className="text-center">{t('welcome.subtitle')}</Muted>
      </View>
      <Button label={t('welcome.start')} onPress={() => router.push('/sign-up')} />
      <Button
        variant="secondary"
        label={t('welcome.haveAccount')}
        onPress={() => router.push('/sign-in')}
      />
    </Screen>
  );
}
