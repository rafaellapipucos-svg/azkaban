import { proofReviewInputSchema, type ProofReviewInput } from '@azkaban/contracts';
import { canReviewProof } from '@azkaban/core';
import {
  groupsRepository,
  proofFailureCode,
  proofRepository,
  useCurrentUser,
  type ProofReviewItem,
} from '@azkaban/data';
import { useTranslation } from '@azkaban/i18n';
import {
  Body,
  Button,
  Card,
  EmptyState,
  ErrorText,
  FormTextField,
  Muted,
  Screen,
  SegmentedControl,
  StatusBadge,
  Subtitle,
  Title,
  tokens,
} from '@azkaban/ui';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useController, useForm } from 'react-hook-form';
import { Image, View } from 'react-native';
import type { z } from 'zod';
import { useInstantText, useRefreshProofs } from './hooks';

const disputeSchema = proofReviewInputSchema.options[1].omit({ proofId: true, decision: true });
type DisputeValues = z.infer<typeof disputeSchema>;

/** The photo, from a URL asked for at each opening: it lasts a minute, so it is never kept. */
function ProofImage({ proof }: { proof: ProofReviewItem }) {
  const { t } = useTranslation('proof');
  const [broken, setBroken] = useState(false);
  const deleted = proof.photoDeletedAt !== null;
  const signed = useQuery({
    queryKey: ['proof-url', proof.id],
    queryFn: () => proofRepository.signedUrl(proof.id),
    enabled: !deleted,
    gcTime: 0,
    staleTime: 0,
    retry: false,
    refetchOnWindowFocus: false,
  });
  if (deleted || (signed.isError && proofFailureCode(signed.error) === 'proof_photo_deleted')) {
    return <Muted>{t('review.photoDeleted')}</Muted>;
  }
  if (signed.isError || broken) {
    return (
      <>
        <ErrorText>{t('review.photoFailed')}</ErrorText>
        <Button
          variant="secondary"
          label={t('review.reloadPhoto')}
          onPress={() => {
            setBroken(false);
            void signed.refetch();
          }}
        />
      </>
    );
  }
  if (!signed.data) return <Muted>{t('loading')}</Muted>;
  return (
    <Image
      source={{ uri: signed.data.url }}
      role="img"
      aria-label={t('review.image', { task: proof.task.title })}
      resizeMode="contain"
      onError={() => setBroken(true)}
      // No rounded corner: it would cut the stamp, which runs to the bottom edge.
      style={{ width: '100%', aspectRatio: proof.widthPx / proof.heightPx }}
    />
  );
}

function DisputeForm({
  pending,
  onSubmit,
  onCancel,
}: {
  pending: boolean;
  onSubmit: (values: DisputeValues) => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation('proof');
  const { control, handleSubmit } = useForm<DisputeValues>({
    resolver: zodResolver(disputeSchema),
    defaultValues: { toStatus: 'partial', note: '' },
  });
  const { field } = useController({ control, name: 'toStatus' });
  return (
    <Card>
      <Subtitle>{t('review.disputeTitle')}</Subtitle>
      <SegmentedControl
        label={t('review.toStatus')}
        value={field.value}
        onChange={field.onChange}
        options={[
          { value: 'partial', label: t('review.toPartial') },
          { value: 'missed', label: t('review.toMissed') },
        ]}
      />
      <FormTextField
        control={control}
        name="note"
        label={t('review.reason')}
        errorText={t('review.reasonInvalid')}
        multiline
      />
      <Button
        variant="danger"
        label={t('review.disputeSend')}
        loading={pending}
        onPress={handleSubmit(onSubmit)}
      />
      <Button variant="secondary" label={t('review.cancel')} onPress={onCancel} />
    </Card>
  );
}

function ServerRecord({ proof, authorName }: { proof: ProofReviewItem; authorName: string }) {
  const { t } = useTranslation('proof');
  const when = useInstantText();
  return (
    <Card>
      <Subtitle level={3}>{t('review.official')}</Subtitle>
      <Body>{t('review.receivedAt', { when: when(proof.receivedAt) })}</Body>
      <Body>{t('review.author', { name: authorName })}</Body>
      <Body>{t('review.capturedAt', { when: when(proof.capturedAtDevice) })}</Body>
      {proof.distanceM !== null ? (
        <Body>
          {t('review.distance', {
            distance: proof.distanceM,
            accuracy: proof.accuracyM ?? 0,
          })}
        </Body>
      ) : null}
      {proof.flags.length === 0 ? <Muted>{t('review.noFlags')}</Muted> : null}
      {proof.flags.map((flag) => (
        <Body key={flag} className="font-heavy">
          <Body aria-hidden>⚠ </Body>
          {t(`flags.${flag}`)}
        </Body>
      ))}
      <Muted>
        {proof.platform === null
          ? t('review.deviceUnknown')
          : proof.appVersion === null
            ? t('review.deviceNoVersion', { platform: t(`review.platform.${proof.platform}`) })
            : t('review.device', {
                platform: t(`review.platform.${proof.platform}`),
                version: proof.appVersion,
              })}
      </Muted>
      {proof.userAgent ? (
        <Muted className="text-sm">{t('review.userAgent', { value: proof.userAgent })}</Muted>
      ) : null}
    </Card>
  );
}

/** One proof: what the server recorded beside the photo, and the review for who may do it. */
export function ProofReviewScreen({ proofId }: { proofId: string }) {
  const { t } = useTranslation('proof');
  const router = useRouter();
  const refresh = useRefreshProofs();
  const { user } = useCurrentUser();
  const [disputing, setDisputing] = useState(false);
  const detail = useQuery({
    queryKey: ['proof', proofId],
    queryFn: () => proofRepository.get(proofId),
  });
  const proof = detail.data;
  const groupId = proof?.task.groupId ?? null;
  const members = useQuery({
    queryKey: ['group-members', groupId],
    queryFn: () => groupsRepository.listMembers(groupId ?? ''),
    enabled: groupId !== null,
  });
  const goBack = () => (router.canGoBack() ? router.back() : router.replace('/'));
  const review = useMutation({
    mutationFn: proofRepository.review,
    onSuccess: async () => {
      await refresh();
      goBack();
    },
    // A decision someone else took shows here as soon as the screen reads it again.
    onError: () => refresh(),
  });
  const decide = (input: ProofReviewInput) => review.mutate(input);

  if (detail.isPending) {
    return (
      <Screen title={t('review.title')}>
        <Muted>{t('loading')}</Muted>
      </Screen>
    );
  }
  if (!proof) {
    return (
      <Screen title={t('review.title')}>
        <EmptyState text={t('review.notFound')} />
        <Button variant="secondary" label={t('back')} onPress={goBack} />
      </Screen>
    );
  }

  const authorName =
    proof.userId === user.id
      ? t('review.you')
      : (members.data?.find(({ userId }) => userId === proof.userId)?.displayName ??
        t('review.someone'));
  // The author never sees these: the server refuses it either way.
  const canAct =
    proof.supersededAt === null &&
    canReviewProof(user, {
      groupId: proof.task.groupId,
      visibility: proof.task.visibility,
      authorId: proof.userId ?? '',
    });

  return (
    <Screen title={t('review.title')}>
      <Title>{proof.task.title}</Title>
      <View className="items-start" style={{ gap: tokens.spacing[2] }}>
        <StatusBadge
          status={proof.occurrenceStatus}
          reviewing={proof.reviewStatus === 'in_review'}
        />
        <Body>{t(`review.reviewStatus.${proof.reviewStatus}`)}</Body>
        {proof.reviewNote ? <Body>{t('review.note', { note: proof.reviewNote })}</Body> : null}
        {proof.supersededAt ? <Muted>{t('review.superseded')}</Muted> : null}
      </View>
      <ProofImage proof={proof} />
      <Muted>{t('review.stampNote')}</Muted>
      {proof.platform === 'web' ? <Muted>{t('review.webLimit')}</Muted> : null}
      <ServerRecord proof={proof} authorName={authorName} />

      {review.isError ? (
        <ErrorText>{t(`errors.${proofFailureCode(review.error)}`)}</ErrorText>
      ) : null}
      {canAct && disputing ? (
        <DisputeForm
          pending={review.isPending}
          onCancel={() => setDisputing(false)}
          onSubmit={(values) => decide({ proofId, decision: 'dispute', ...values })}
        />
      ) : null}
      {canAct && !disputing ? (
        <>
          {proof.reviewStatus === 'approved' ? null : (
            <Button
              label={t(proof.reviewStatus === 'disputed' ? 'review.undo' : 'review.approve')}
              loading={review.isPending}
              onPress={() => decide({ proofId, decision: 'approve', note: null })}
            />
          )}
          {proof.reviewStatus === 'disputed' ? null : (
            <Button
              variant="secondary"
              label={t('review.dispute')}
              onPress={() => setDisputing(true)}
            />
          )}
        </>
      ) : null}
    </Screen>
  );
}
