import { ProofQueueLink } from '@azkaban/feature-proof';
import { TeamScreen } from '@azkaban/feature-tasks';
import { useLocalSearchParams } from 'expo-router';

// The photo reviews belong to another module, so the route composes their entry point.
export default function Team() {
  const { groupId } = useLocalSearchParams<{ groupId: string }>();
  return (
    <TeamScreen groupId={groupId}>
      <ProofQueueLink groupId={groupId} />
    </TeamScreen>
  );
}
