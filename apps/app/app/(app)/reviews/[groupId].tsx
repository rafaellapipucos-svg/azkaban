import { ProofQueueScreen } from '@azkaban/feature-proof';
import { useLocalSearchParams } from 'expo-router';

export default function ProofQueue() {
  const { groupId } = useLocalSearchParams<{ groupId: string }>();
  return <ProofQueueScreen groupId={groupId} />;
}
