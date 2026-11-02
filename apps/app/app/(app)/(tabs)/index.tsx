import { TodayScreen } from '@azkaban/feature-tasks';
import { useRouter } from 'expo-router';

export default function Today() {
  const router = useRouter();
  return <TodayScreen onProof={(id) => router.push(`/tasks/${id}/proof`)} />;
}
