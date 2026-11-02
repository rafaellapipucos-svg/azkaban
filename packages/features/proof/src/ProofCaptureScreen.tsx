import { proofRules } from '@azkaban/config';
import { tasksRepository, useCurrentUser } from '@azkaban/data';
import { useTranslation } from '@azkaban/i18n';
import {
  PhotoError,
  ProofCamera,
  photoDataUri,
  useOnline,
  type CameraFacing,
  type CameraStatus,
  type PhotoErrorCode,
  type ProofCameraHandle,
  type ProofPhoto,
} from '@azkaban/platform';
import {
  Body,
  Button,
  Card,
  ErrorText,
  Muted,
  Screen,
  StatusBadge,
  Subtitle,
  Title,
  tokens,
} from '@azkaban/ui';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { Image, View, useWindowDimensions } from 'react-native';
import { proofRecovery } from './recovery';
import { useProofFlow, type ProofOutcome } from './useProofFlow';

// Square: a taller preview pushes the shutter below the fold of a phone.
const PHOTO_RATIO = 1;
// On a wide, short window the column is taller than the screen: the preview takes at most this share
// of the window's height, so the shutter stays in view at 1280x800. A phone is never limited by it.
const PREVIEW_MAX_HEIGHT_SHARE = 0.5;

function ConsentStep({ onAccept, onDecline }: { onAccept: () => void; onDecline: () => void }) {
  const { t } = useTranslation('proof');
  return (
    <>
      <Subtitle>{t('consent.title')}</Subtitle>
      <Card>
        <Body>{t('consent.collected')}</Body>
        <Body>{t('consent.coordinates')}</Body>
        <Body>{t('consent.viewers')}</Body>
        <Body>{t('consent.stamp')}</Body>
        <Body>{t('consent.thirdParties')}</Body>
        <Body>
          {t('consent.retention', {
            days: proofRules.retentionDays,
            recordDays: proofRules.recordRetentionDays,
          })}
        </Body>
        <Body>{t('consent.deletion')}</Body>
      </Card>
      <Muted>{t('consent.declineHint')}</Muted>
      <Button label={t('consent.accept')} onPress={onAccept} />
      <Button variant="secondary" label={t('consent.decline')} onPress={onDecline} />
    </>
  );
}

function LocationStep({ onAllow, onSkip }: { onAllow: () => void; onSkip: () => void }) {
  const { t } = useTranslation('proof');
  return (
    <>
      <Subtitle>{t('location.title')}</Subtitle>
      <Body>{t('location.why')}</Body>
      <Muted>{t('location.skipHint')}</Muted>
      <Button label={t('location.allow')} onPress={onAllow} />
      <Button variant="secondary" label={t('location.skip')} onPress={onSkip} />
    </>
  );
}

function CameraStep({
  failure,
  taskTitle,
  onPhoto,
  onBack,
}: {
  failure: string | null;
  taskTitle: string | undefined;
  onPhoto: (photo: ProofPhoto) => void;
  onBack: () => void;
}) {
  const { t, i18n } = useTranslation('proof');
  const { displayName, timezone } = useCurrentUser();
  const camera = useRef<ProofCameraHandle>(null);
  const [status, setStatus] = useState<CameraStatus>({ permission: 'prompt' });
  const [facing, setFacing] = useState<CameraFacing>('back');
  const [photoError, setPhotoError] = useState<PhotoErrorCode | null>(null);
  const [taking, setTaking] = useState(false);
  const screen = useWindowDimensions();

  const take = async () => {
    if (!camera.current || taskTitle === undefined) return;
    setTaking(true);
    setPhotoError(null);
    try {
      onPhoto(
        await camera.current.capture({
          taskTitle,
          userName: displayName,
          locale: i18n.language,
          timeZone: timezone,
        }),
      );
    } catch (error) {
      setPhotoError(error instanceof PhotoError ? error.code : 'encode_failed');
    } finally {
      setTaking(false);
    }
  };

  if (status.permission === 'denied' || status.permission === 'unavailable') {
    return (
      <>
        <ErrorText>
          {status.permission === 'denied'
            ? t('camera.denied')
            : t(`camera.reason.${status.reason ?? 'error'}`)}
        </ErrorText>
        <Body>{t('camera.fallback')}</Body>
        {/* Back to `prompt` remounts the camera, which asks again. */}
        <Button label={t('retry')} onPress={() => setStatus({ permission: 'prompt' })} />
        <Button variant="secondary" label={t('back')} onPress={onBack} />
      </>
    );
  }

  return (
    <>
      <Subtitle>{t('camera.title')}</Subtitle>
      <Muted>{t('camera.hint')}</Muted>
      {failure ? <ErrorText>{t(`errors.${failure}`)}</ErrorText> : null}
      {photoError ? <ErrorText>{t(`photo.${photoError}`)}</ErrorText> : null}
      <View
        style={{
          width: '100%',
          maxWidth: Math.round(screen.height * PREVIEW_MAX_HEIGHT_SHARE * PHOTO_RATIO),
          alignSelf: 'center',
          aspectRatio: PHOTO_RATIO,
          borderRadius: tokens.radii.lg,
          overflow: 'hidden',
        }}
      >
        <ProofCamera
          ref={camera}
          facing={facing}
          label={t('camera.preview')}
          onStatusChange={setStatus}
        />
      </View>
      <Button
        label={t('camera.take')}
        loading={taking}
        disabled={status.permission !== 'granted' || taskTitle === undefined || !displayName}
        onPress={() => void take()}
      />
      <Button
        variant="secondary"
        label={t('camera.flip')}
        onPress={() => setFacing(facing === 'back' ? 'front' : 'back')}
      />
    </>
  );
}

function ConfirmStep({
  photo,
  failure,
  sending,
  online,
  onSend,
  onRetake,
}: {
  photo: ProofPhoto;
  failure: string | null;
  sending: boolean;
  online: boolean;
  onSend: () => void;
  onRetake: () => void;
}) {
  const { t } = useTranslation('proof');
  // Kept across renders, because the string is as long as the photo.
  const [uri] = useState(() => photoDataUri(photo));
  return (
    <>
      <Subtitle>{t('confirm.title')}</Subtitle>
      {failure ? <ErrorText>{t(`errors.${failure}`)}</ErrorText> : null}
      <Image
        source={{ uri }}
        role="img"
        aria-label={t('confirm.image')}
        resizeMode="contain"
        // No rounded corner: it would cut the stamp, which runs to the bottom edge.
        style={{ width: '100%', aspectRatio: photo.width / photo.height }}
      />
      {!online ? <Muted>{t('confirm.offline')}</Muted> : null}
      {sending ? <Muted role="status">{t('confirm.sending')}</Muted> : null}
      <Button label={t('confirm.send')} loading={sending} disabled={!online} onPress={onSend} />
      {sending ? null : (
        <Button variant="secondary" label={t('confirm.retake')} onPress={onRetake} />
      )}
    </>
  );
}

function DoneStep({ outcome, onBack }: { outcome: ProofOutcome; onBack: () => void }) {
  const { t } = useTranslation('proof');
  const reviewing = outcome.reviewStatus === 'in_review';
  return (
    <>
      <Subtitle>{t('done.title')}</Subtitle>
      <View className="items-start">
        <StatusBadge status="done" reviewing={reviewing} />
      </View>
      <Body role="status">{t(reviewing ? 'done.inReview' : 'done.accepted')}</Body>
      {outcome.late ? <Muted>{t('done.late')}</Muted> : null}
      {outcome.flags.map((flag) => (
        <Body key={flag}>
          <Body aria-hidden>⚠ </Body>
          {t(`flags.${flag}`)}
        </Body>
      ))}
      <Button label={t('back')} onPress={onBack} />
    </>
  );
}

/** The whole capture. There is no way in here but the camera: no picker, no gallery, no file input. */
export function ProofCaptureScreen({ occurrenceId }: { occurrenceId: string }) {
  const { t } = useTranslation('proof');
  const router = useRouter();
  const online = useOnline();
  const flow = useProofFlow(occurrenceId, online);
  const occurrence = useQuery({
    queryKey: ['occurrence', occurrenceId],
    queryFn: () => tasksRepository.getOccurrence(occurrenceId),
  });
  const taskTitle = occurrence.data?.task.title;
  const goBack = () =>
    router.canGoBack() ? router.back() : router.replace(`/tasks/${occurrenceId}`);
  const { stage } = flow;

  // A photo already taken waits on its screen. Everything before it needs the connection.
  const before = !['confirm', 'sending', 'done', 'stopped', 'expired'].includes(stage.name);
  // Never the task's title: the document title lands in the browser history.
  const screenTitle =
    stage.name === 'confirm' || stage.name === 'sending'
      ? t('confirm.title')
      : stage.name === 'done'
        ? t('done.title')
        : t('screenTitle');
  return (
    <Screen title={screenTitle}>
      <Title>{taskTitle ?? t('loading')}</Title>
      {before && !online ? (
        <>
          <Body role="alert">{t('entry.offline')}</Body>
          <Button variant="secondary" label={t('back')} onPress={goBack} />
        </>
      ) : stage.name === 'starting' ? (
        <Muted role="status">{t('loading')}</Muted>
      ) : stage.name === 'consent' ? (
        <ConsentStep onAccept={() => void flow.acceptConsent()} onDecline={goBack} />
      ) : stage.name === 'location' ? (
        <LocationStep onAllow={() => void flow.locate()} onSkip={flow.skipLocation} />
      ) : stage.name === 'locating' ? (
        <Muted role="status">{t('location.reading')}</Muted>
      ) : stage.name === 'camera' ? (
        <CameraStep
          failure={stage.failure}
          taskTitle={taskTitle}
          onPhoto={flow.photoTaken}
          onBack={goBack}
        />
      ) : stage.name === 'confirm' || stage.name === 'sending' ? (
        <ConfirmStep
          key={stage.photo.sha256}
          photo={stage.photo}
          failure={stage.name === 'confirm' ? stage.failure : null}
          sending={stage.name === 'sending'}
          online={online}
          onSend={() => void flow.send(stage.photo)}
          onRetake={flow.retake}
        />
      ) : stage.name === 'expired' ? (
        <>
          <Subtitle>{t('expired.title')}</Subtitle>
          <Body role="alert">{t('expired.body')}</Body>
          <Button label={t('expired.again')} onPress={() => void flow.start()} />
          <Button variant="secondary" label={t('back')} onPress={goBack} />
        </>
      ) : stage.name === 'done' ? (
        <DoneStep outcome={stage.outcome} onBack={goBack} />
      ) : (
        <>
          <ErrorText>{t(`errors.${stage.failure}`)}</ErrorText>
          {proofRecovery[stage.failure] === 'keep_photo' ? (
            <Button label={t('retry')} onPress={() => void flow.start()} />
          ) : null}
          <Button variant="secondary" label={t('back')} onPress={goBack} />
        </>
      )}
    </Screen>
  );
}
