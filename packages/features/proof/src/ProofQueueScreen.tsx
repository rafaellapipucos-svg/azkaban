import { can } from '@azkaban/core';
import { groupsRepository, proofRepository, useCurrentUser } from '@azkaban/data';
import { useTranslation } from '@azkaban/i18n';
import {
  Body,
  Button,
  Card,
  EmptyState,
  ErrorText,
  Muted,
  Screen,
  StatusBadge,
  Title,
} from '@azkaban/ui';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { View } from 'react-native';
import { useInstantText } from './hooks';

/** A group's photos waiting for an admin, the oldest first. */
export function ProofQueueScreen({ groupId }: { groupId: string }) {
  const { t } = useTranslation('proof');
  const router = useRouter();
  const { user, ready } = useCurrentUser();
  const when = useInstantText();
  const allowed = can(user, 'proof.review', { id: groupId });
  const queue = useQuery({
    queryKey: ['proof-queue', groupId],
    queryFn: () => proofRepository.listReviewQueue(groupId),
    enabled: allowed,
  });
  const members = useQuery({
    queryKey: ['group-members', groupId],
    queryFn: () => groupsRepository.listMembers(groupId),
    enabled: allowed,
  });
  const nameOf = (id: string | null) =>
    id === user.id
      ? t('review.you')
      : (members.data?.find(({ userId }) => userId === id)?.displayName ?? t('review.someone'));

  return (
    <Screen title={t('queue.title')}>
      <Title>{t('queue.title')}</Title>
      {ready && !allowed ? <Muted>{t('queue.forbidden')}</Muted> : null}
      {queue.isError ? (
        <>
          <ErrorText>{t('queue.load')}</ErrorText>
          <Button variant="secondary" label={t('retry')} onPress={() => void queue.refetch()} />
        </>
      ) : null}
      {queue.isPending && allowed ? <Muted>{t('loading')}</Muted> : null}
      {queue.data?.length === 0 ? <EmptyState text={t('queue.empty')} /> : null}
      {queue.data?.map((proof) => (
        <Card key={proof.id} onPress={() => router.push(`/proofs/${proof.id}`)}>
          <Body className="font-heavy">{proof.task.title}</Body>
          <Muted>
            {t('queue.item', { name: nameOf(proof.userId), when: when(proof.receivedAt) })}
          </Muted>
          <View className="items-start">
            <StatusBadge status={proof.occurrenceStatus} reviewing />
          </View>
          {proof.flags.map((flag) => (
            <Body key={flag}>
              <Body aria-hidden>⚠ </Body>
              {t(`flags.${flag}`)}
            </Body>
          ))}
          {proof.userId === user.id ? <Muted>{t('queue.mine')}</Muted> : null}
        </Card>
      ))}
    </Screen>
  );
}
