import { ProofQueueBar } from '@azkaban/feature-proof';
import { TeamScreen } from '@azkaban/feature-tasks';
import { useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';

// Features do not import each other, so the route composes the review list's entry above the team view.
export default function Team() {
  const { groupId } = useLocalSearchParams<{ groupId: string }>();
  return (
    <View style={{ flex: 1 }}>
      <ProofQueueBar groupId={groupId} />
      <TeamScreen groupId={groupId} />
    </View>
  );
}
