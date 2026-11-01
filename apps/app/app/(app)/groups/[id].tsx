import { useSession } from '@azkaban/feature-auth';
import { GroupDetailScreen } from '@azkaban/feature-groups';
import { useLocalSearchParams } from 'expo-router';

export default function GroupDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useSession();
  return session ? <GroupDetailScreen groupId={id} userId={session.user.id} /> : null;
}
