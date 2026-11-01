import { useTranslation } from '@azkaban/i18n';
import { StatusBadge } from '@azkaban/ui';
import { Text, View } from 'react-native';

export function WelcomeScreen({ appName }: { appName: string }) {
  const { t } = useTranslation('auth');
  return (
    <View className="flex-1 items-center justify-center gap-4 bg-background p-6 dark:bg-background-dark">
      <Text className="font-heavy text-md text-primary dark:text-text-dark">{appName}</Text>
      <Text role="heading" className="text-center font-heavy text-xl text-text dark:text-text-dark">
        {t('welcome.title')}
      </Text>
      <Text className="text-center font-body text-md text-muted dark:text-muted-dark">
        {t('welcome.subtitle')}
      </Text>
      <View className="flex-row flex-wrap justify-center gap-2 pt-4">
        <StatusBadge status="done" />
        <StatusBadge status="partial" />
        <StatusBadge status="missed" />
      </View>
    </View>
  );
}
