import { can } from '@azkaban/core';
import { proofRepository, useCurrentUser } from '@azkaban/data';
import { useTranslation } from '@azkaban/i18n';
import { useOnline } from '@azkaban/platform';
import { Button, Muted, tokens } from '@azkaban/ui';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { View } from 'react-native';

/** The way to the camera on a task's page. A proof is never queued, so it needs the connection. */
export function ProofButton({ occurrenceId }: { occurrenceId: string }) {
  const { t } = useTranslation('proof');
  const router = useRouter();
  const online = useOnline();
  return (
    <>
      <Button
        label={t('entry.take')}
        disabled={!online}
        onPress={() => router.push(`/tasks/${occurrenceId}/proof`)}
      />
      {online ? null : <Muted>{t('entry.offline')}</Muted>}
    </>
  );
}

/** Above a task's page, for who may see its photo: the author and whoever reviews the group. */
export function ProofLink({ occurrenceId }: { occurrenceId: string }) {
  const { t } = useTranslation('proof');
  const router = useRouter();
  const current = useQuery({
    queryKey: ['proof-current', occurrenceId],
    queryFn: () => proofRepository.currentId(occurrenceId),
  });
  const proofId = current.data;
  if (!proofId) return null;
  return (
    <View className="bg-background dark:bg-background-dark">
      <View
        style={{
          width: '100%',
          maxWidth: tokens.layout.maxContentWidth,
          alignSelf: 'center',
          paddingHorizontal: tokens.spacing[4],
          paddingTop: tokens.spacing[4],
        }}
      >
        <Button
          variant="secondary"
          label={t('link.open')}
          onPress={() => router.push(`/proofs/${proofId}`)}
        />
      </View>
    </View>
  );
}

/** The way into a group's review list, shown only to who reviews it. */
export function ProofQueueLink({ groupId }: { groupId: string }) {
  const { t } = useTranslation('proof');
  const router = useRouter();
  const { user } = useCurrentUser();
  if (!can(user, 'proof.review', { id: groupId })) return null;
  return (
    <Button
      variant="secondary"
      label={t('link.queue')}
      onPress={() => router.push(`/reviews/${groupId}`)}
    />
  );
}
