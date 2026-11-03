import { shoppingRepository } from '@azkaban/data';
import { useTranslation } from '@azkaban/i18n';
import { Body, Button, Card, EmptyState, ErrorText, Muted, Screen, Title } from '@azkaban/ui';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { shoppingKeys, useDateText } from './hooks';
import { shoppingPaths } from './shopping';

/** `/shopping/history?group=`: completed lists of one scope, newest first, read-only. */
export function ShoppingHistoryScreen({ groupId }: { groupId: string | null }) {
  const { t } = useTranslation('shopping');
  const router = useRouter();
  const date = useDateText();
  const lists = useQuery({
    queryKey: shoppingKeys.lists(groupId, 'completed'),
    queryFn: () => shoppingRepository.lists(groupId, 'completed'),
  });

  return (
    <Screen title={t('history.title')}>
      <Title>{t('history.title')}</Title>
      {lists.isPending ? <Muted role="status">{t('lists.loading')}</Muted> : null}
      {lists.isError ? (
        <>
          <ErrorText>{t('lists.load')}</ErrorText>
          <Button
            variant="secondary"
            label={t('lists.retry')}
            onPress={() => void lists.refetch()}
          />
        </>
      ) : null}
      {lists.data?.length === 0 ? <EmptyState text={t('history.empty')} mood="sleeping" /> : null}
      {lists.data?.map((list) => (
        <Card key={list.id} onPress={() => router.push(shoppingPaths.list(list.id))}>
          <Body className="font-heavy">{list.name}</Body>
          {list.completedAt ? (
            <Muted>{t('history.completedAt', { date: date(list.completedAt) })}</Muted>
          ) : null}
        </Card>
      ))}
    </Screen>
  );
}
