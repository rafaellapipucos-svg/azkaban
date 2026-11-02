import { NotificationBell } from '@azkaban/feature-notifications';
import { TodayScreen } from '@azkaban/feature-tasks';
import { useRouter } from 'expo-router';

// Features do not import each other, so the route puts the bell in Hoje's header.
export default function Today() {
  const router = useRouter();
  return (
    <TodayScreen
      onProof={(id) => router.push(`/tasks/${id}/proof`)}
      headerRight={<NotificationBell />}
    />
  );
}
