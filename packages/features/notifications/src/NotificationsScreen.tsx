import { notificationsRepository } from '@azkaban/data';
import { useTranslation } from '@azkaban/i18n';
import { Body, Button, Card, EmptyState, ErrorText, Muted, Screen, Title } from '@azkaban/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { bellKey, useItemText, useOpenItem, useWhenText } from './hooks';

/** `/notifications`: the bell's list, newest first. A tap marks the line read and opens its target. */
export function NotificationsScreen() {
  const { t } = useTranslation('notifications');
  const queryClient = useQueryClient();
  const list = useQuery({ queryKey: [...bellKey, 'list'], queryFn: notificationsRepository.list });
  const markAll = useMutation({
    mutationFn: notificationsRepository.markAllRead,
    onSettled: () => queryClient.invalidateQueries({ queryKey: bellKey }),
  });
  const text = useItemText();
  const open = useOpenItem();
  const when = useWhenText();
  const unread = list.data?.some((item) => !item.readAt) ?? false;

  return (
    <Screen title={t('inbox.title')}>
      <Title>{t('inbox.title')}</Title>
      {list.isPending ? <Muted role="status">{t('inbox.loading')}</Muted> : null}
      {list.isError ? (
        <>
          <ErrorText>{t('inbox.load')}</ErrorText>
          <Button
            variant="secondary"
            label={t('inbox.retry')}
            onPress={() => void list.refetch()}
          />
        </>
      ) : null}
      {unread ? (
        <Button
          variant="secondary"
          label={t('inbox.markAll')}
          loading={markAll.isPending}
          onPress={() => markAll.mutate()}
        />
      ) : null}
      {list.data?.length === 0 ? <EmptyState text={t('inbox.empty')} mood="sleeping" /> : null}
      {list.data?.map((item) => {
        const { title, body } = text(item);
        return (
          <Card key={item.id} onPress={() => open(item)}>
            <Body className={item.readAt ? '' : 'font-heavy'}>{title}</Body>
            {body ? <Body>{body}</Body> : null}
            <Muted>
              {when(item.createdAt)}
              {item.readAt ? '' : ` · ${t('inbox.unread')}`}
            </Muted>
          </Card>
        );
      })}
    </Screen>
  );
}
