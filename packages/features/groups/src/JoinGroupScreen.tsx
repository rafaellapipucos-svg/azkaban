import { rateLimitedErrorCode } from '@azkaban/contracts';
import { callFailure, groupsRepository, type CallFailure } from '@azkaban/data';
import { useTranslation } from '@azkaban/i18n';
import { Body, Button, EmptyState, ErrorText, Mascot, Screen, Title } from '@azkaban/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { View } from 'react-native';

// ADR-0012, section 7: an employee reads what the admin sees before accepting a work group's invite.
const workGroupType = 'company';

// ponytail: no test here (the package has no test runner); `callFailure` is tested in data, and the
// `Record` makes the compiler ask for a text for every code.
const failureText: Record<CallFailure, string> = {
  rate_limited: 'join.rateLimited',
  network: 'join.network',
  unavailable: 'join.unavailable',
};
const inviteFailureKey = (error: unknown, fallback: string) => {
  const code = callFailure(error);
  return code ? failureText[code] : fallback;
};

export function JoinGroupScreen({ code, signedIn }: { code: string; signedIn: boolean }) {
  const { t } = useTranslation('groups');
  const router = useRouter();
  const queryClient = useQueryClient();
  const preview = useQuery({
    queryKey: ['invite', code],
    queryFn: () => groupsRepository.previewInvite(code),
    enabled: signedIn,
    // Each try spends the invite limit: over it, trying again only digs deeper.
    retry: (failures, error) => error.message !== rateLimitedErrorCode && failures < 3,
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
        <Title>{t('join.title')}</Title>
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

  // Only while there is no preview to show. Offline the read waits (paused) instead of failing.
  const previewError =
    preview.data !== undefined ? null : preview.isPaused ? new Error('network') : preview.error;
  if (preview.data === null || previewError) {
    const canRetry = previewError !== null && callFailure(previewError) !== rateLimitedErrorCode;
    return (
      <Screen title={t('join.title')}>
        <Title>{t('join.title')}</Title>
        <EmptyState
          mood="worried"
          text={t(previewError ? inviteFailureKey(previewError, 'errors.generic') : 'join.invalid')}
        >
          {canRetry ? (
            <Button
              label={t('join.retry')}
              loading={preview.isFetching && !preview.isPaused}
              onPress={() => void preview.refetch()}
            />
          ) : null}
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
      {accept.isError ? (
        <ErrorText>{t(inviteFailureKey(accept.error, 'join.invalid'))}</ErrorText>
      ) : null}
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
