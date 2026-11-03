import { useTranslation } from '@azkaban/i18n';
import { Button, EmptyState, Screen, Title } from '@azkaban/ui';
import { useRouter } from 'expo-router';

// Any address that matches no route. The default screen is in English and ignores the theme.
export default function NotFound() {
  const { t } = useTranslation();
  const router = useRouter();
  return (
    <Screen title={t('notFound.title')}>
      <Title>{t('notFound.title')}</Title>
      <EmptyState mood="worried" text={t('notFound.text')}>
        <Button label={t('notFound.home')} onPress={() => router.replace('/')} />
      </EmptyState>
    </Screen>
  );
}
