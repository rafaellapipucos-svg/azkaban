import { useSession } from '@azkaban/feature-auth';
import { GroupDetailScreen } from '@azkaban/feature-groups';
import { TeamLink } from '@azkaban/feature-tasks';
import { useLocalSearchParams } from 'expo-router';

// The team view belongs to tasks, so the route composes its entry point into the group's page.
export default function GroupDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useSession();
  return session ? (
    <GroupDetailScreen groupId={id} userId={session.user.id}>
      <TeamLink groupId={id} />
    </GroupDetailScreen>
  ) : null;
}
