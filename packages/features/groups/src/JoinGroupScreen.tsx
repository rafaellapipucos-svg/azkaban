import { groupsRepository } from '@azkaban/data';
import { useTranslation } from '@azkaban/i18n';
import { Body, Button, EmptyState, ErrorText, Mascot, Screen, Title } from '@azkaban/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { View } from 'react-native';

// ADR-0012, section 7: an employee reads what the admin sees before accepting a work group's invite.
const workGroupType = 'company';

export function JoinGroupScreen({ code, signedIn }: { code: string; signedIn: boolean }) {
  const { t } = useTranslation('groups');
  const router = useRouter();
  const queryClient = useQueryClient();
  const preview = useQuery({
    queryKey: ['invite', code],
    queryFn: () => groupsRepository.previewInvite(code),
    enabled: signedIn,
  });
  const accept = useMutation({
    mutationFn: () => groupsRepository.acceptInvite(code),
    onSuccess: async (groupId) => {
      await queryClient.invalidateQueries({ queryKey: ['groups'] });
      await queryClient.invalidateQueries({ queryKey: ['contexts'] });
      router.replace(`/groups/${groupId}`);
    },
  });

  if (!signedIn) {
    return (
      <Screen title={t('join.title')}>
        <EmptyState mood="happy" text={t('join.signInFirst')}>
          <Button
            label={t('join.signIn')}
            onPress={() =>
              router.replace({ pathname: '/sign-in', params: { next: `/join/${code}` } })
            }
          />
        </EmptyState>
      </Screen>
    );
  }

  if (preview.data === null) {
    return (
      <Screen title={t('join.title')}>
        <EmptyState mood="worried" text={t('join.invalid')}>
          <Button
            variant="secondary"
            label={t('actions.back')}
            onPress={() => router.replace('/')}
          />
        </EmptyState>
      </Screen>
    );
  }

  return (
    <Screen title={t('join.title')}>
      <View className="items-center">
        <Mascot mood="celebrating" />
      </View>
      <Title>{t('join.title')}</Title>
      {preview.data ? (
        <Body>
          {t('join.description', {
            group: preview.data.groupName,
            role: t(`roles.${preview.data.role}`),
          })}
        </Body>
      ) : null}
      {preview.data?.groupType === workGroupType ? (
        <Button
          variant="secondary"
          label={t('transparency.open')}
          onPress={() =>
            router.push({ pathname: '/transparency', params: { groupType: workGroupType } })
          }
        />
      ) : null}
      {accept.isError ? <ErrorText>{t('join.invalid')}</ErrorText> : null}
      <Button
        label={t('join.accept')}
        loading={accept.isPending}
        disabled={!preview.data}
        onPress={() => accept.mutate()}
      />
      <Button variant="secondary" label={t('join.decline')} onPress={() => router.replace('/')} />
    </Screen>
  );
}
