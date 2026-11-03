import { StreakChip } from '@azkaban/feature-gamification';
import { NotificationBell, usePushSetupOffer } from '@azkaban/feature-notifications';
import { TodayScreen } from '@azkaban/feature-tasks';
import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { env } from '../../../src/env';

// Features do not import each other, so the route puts the streak and the bell in Hoje's header.
export default function Today() {
  const router = useRouter();
  // The push step after the first sign-in on this device (ADR-0012, section 13, item 2).
  const offerPush = usePushSetupOffer(env.EXPO_PUBLIC_VAPID_PUBLIC_KEY);
  useEffect(() => {
    if (offerPush) router.push('/push-setup');
  }, [offerPush, router]);
  return (
    <TodayScreen
      onProof={(id) => router.push(`/tasks/${id}/proof`)}
      headerStreak={<StreakChip onPress={() => router.push('/profile')} />}
      headerRight={<NotificationBell />}
    />
  );
}
