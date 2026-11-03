import { TeamScreen } from '@azkaban/feature-tasks';
import { useLocalSearchParams } from 'expo-router';

export default function Team() {
  const { groupId } = useLocalSearchParams<{ groupId: string }>();
  return <TeamScreen groupId={groupId} />;
}
