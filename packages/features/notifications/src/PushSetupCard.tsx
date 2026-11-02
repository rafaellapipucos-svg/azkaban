import { useCurrentUser } from '@azkaban/data';
import { useTranslation } from '@azkaban/i18n';
import { pushPermission, pushSupport } from '@azkaban/platform';
import { Body, Button, ErrorText, Subtitle } from '@azkaban/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { View } from 'react-native';
import { enableThisDevice, thisDeviceId } from './device';

export const thisDeviceQueryKey = (userId: string) => ['push-this-device', userId];

/**
 * Turns push on in this browser, or says why it cannot (ADR-0008, section 9). Without a public key,
 * push does not exist in this environment and the card is not shown.
 */
export function PushSetupCard({ vapidPublicKey }: { vapidPublicKey?: string }) {
  const { t } = useTranslation('notifications');
  const { user } = useCurrentUser();
  const queryClient = useQueryClient();
  const support = pushSupport();
  const thisDevice = useQuery({
    queryKey: thisDeviceQueryKey(user.id),
    queryFn: () => thisDeviceId(user.id),
    enabled: Boolean(user.id),
  });
  const enable = useMutation({
    mutationFn: () => enableThisDevice(user.id, vapidPublicKey ?? ''),
    onSettled: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: thisDeviceQueryKey(user.id) }),
        queryClient.invalidateQueries({ queryKey: ['push-devices'] }),
      ]),
  });
  if (!vapidPublicKey) return null;

  const status = () => {
    if (support === 'needs_install') {
      return (
        <>
          <Body className="font-heavy">{t('setup.ios.title')}</Body>
          <Body>{t('setup.ios.steps')}</Body>
        </>
      );
    }
    if (support === 'ios_too_old') return <Body>{t('setup.ios.tooOld')}</Body>;
    if (support === 'unsupported' || enable.data === 'not_allowed') {
      return <Body>{t('setup.unsupported')}</Body>;
    }
    // Read on each render, so a "block" chosen in the prompt shows at once.
    if (pushPermission() === 'denied') return <Body>{t('setup.denied')}</Body>;
    if (thisDevice.data && pushPermission() === 'granted') {
      return <Body role="status">{t('setup.enabled')}</Body>;
    }
    return (
      <>
        <Body>{t('setup.text')}</Body>
        <Button
          label={t('setup.enable')}
          loading={enable.isPending}
          disabled={!thisDevice.isSuccess}
          onPress={() => enable.mutate()}
        />
        {enable.data === 'failed' ? <ErrorText>{t('setup.failed')}</ErrorText> : null}
      </>
    );
  };

  return (
    <View className="gap-2 rounded-lg border-2 border-border bg-surface p-4 dark:border-border-dark dark:bg-surface-dark">
      <Subtitle>{t('setup.title')}</Subtitle>
      {status()}
    </View>
  );
}
