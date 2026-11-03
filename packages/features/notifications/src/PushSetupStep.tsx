import { safeInternalPath } from '@azkaban/core';
import { useCurrentUser } from '@azkaban/data';
import { useTranslation } from '@azkaban/i18n';
import { onPushOpened, pushPermission, pushSupport, storage } from '@azkaban/platform';
import { Button, Screen, Title } from '@azkaban/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { notificationsConfig } from './config';
import { thisDeviceId } from './device';
import { PushSetupCard, thisDeviceQueryKey } from './PushSetupCard';
import { shouldOfferPushSetup } from './pushOffer';

const markOffered = () => storage.setItem(notificationsConfig.pushOfferedKey, '1');
const offerQueryKey = (userId: string) => ['push-setup-offer', userId];

/**
 * True once, after signing in, while this device never showed the push step and it has something to
 * offer (ADR-0012, section 13, item 2). The route decides where the step lives.
 */
export function usePushSetupOffer(vapidPublicKey: string | undefined): boolean {
  const { user } = useCurrentUser();
  const offer = useQuery({
    queryKey: offerQueryKey(user.id),
    queryFn: async () =>
      shouldOfferPushSetup({
        vapidPublicKey,
        support: pushSupport(),
        permission: pushPermission(),
        offered: (await storage.getItem(notificationsConfig.pushOfferedKey)) !== null,
        enabledHere: (await thisDeviceId(user.id)) !== null,
      }),
    enabled: Boolean(user.id),
    staleTime: Infinity,
  });
  return offer.data === true;
}

/** The step: the same card as the preferences, with a way out. Seen counts as offered. */
export function PushSetupStep({
  vapidPublicKey,
  onDone,
}: {
  vapidPublicKey?: string;
  onDone: () => void;
}) {
  const { t } = useTranslation('notifications');
  const { user } = useCurrentUser();
  const thisDevice = useQuery({
    queryKey: thisDeviceQueryKey(user.id),
    queryFn: () => thisDeviceId(user.id),
    enabled: Boolean(user.id),
  });
  const queryClient = useQueryClient();
  // Hoje asks once and keeps the answer: without this, going back to it opens the step again.
  useEffect(() => {
    void markOffered();
    queryClient.setQueryData(offerQueryKey(user.id), false);
  }, [queryClient, user.id]);
  return (
    <Screen title={t('setup.title')}>
      <Title>{t('setup.title')}</Title>
      <PushSetupCard vapidPublicKey={vapidPublicKey} titled={false} />
      <Button
        variant="secondary"
        label={thisDevice.data ? t('setup.continue') : t('setup.notNow')}
        onPress={onDone}
      />
    </Screen>
  );
}

/** Native: a tapped notification opens its path, only an internal one. Web has `sw.js` for it. */
export function useOpenPushedPaths(enabled: boolean) {
  const router = useRouter();
  useEffect(() => {
    if (!enabled) return;
    return onPushOpened((url) => {
      const path = safeInternalPath(url);
      if (path) router.push(path);
    });
  }, [enabled, router]);
}
