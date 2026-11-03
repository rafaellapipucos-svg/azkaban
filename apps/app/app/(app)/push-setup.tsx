import { PushSetupStep } from '@azkaban/feature-notifications';
import { useRouter } from 'expo-router';
import { env } from '../../src/env';

export default function PushSetup() {
  const router = useRouter();
  return (
    <PushSetupStep
      vapidPublicKey={env.EXPO_PUBLIC_VAPID_PUBLIC_KEY}
      onDone={() => router.replace('/')}
    />
  );
}
