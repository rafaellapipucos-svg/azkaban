import { useSession } from '@azkaban/feature-auth';
import { GroupRanking } from '@azkaban/feature-gamification';
import { GroupDetailScreen } from '@azkaban/feature-groups';
import { ProofQueueLink } from '@azkaban/feature-proof';
import { TeamLink } from '@azkaban/feature-tasks';
import { useLocalSearchParams } from 'expo-router';

// The team view, the photo reviews and the ranking belong to other modules, so the route composes
// them into the group's page.
export default function GroupDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useSession();
  return session ? (
    <GroupDetailScreen groupId={id} userId={session.user.id}>
      <TeamLink groupId={id} />
      <ProofQueueLink groupId={id} />
      <GroupRanking groupId={id} />
    </GroupDetailScreen>
  ) : null;
}
