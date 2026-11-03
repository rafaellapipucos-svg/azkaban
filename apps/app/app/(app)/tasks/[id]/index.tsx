import { ProofButton, ProofLink } from '@azkaban/feature-proof';
import { TaskShoppingLink } from '@azkaban/feature-shopping';
import { TaskDetailScreen } from '@azkaban/feature-tasks';
import { useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';

// Features do not import each other, so the route composes the photo flow and the linked shopping
// list into the task's page.
export default function TaskDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <View style={{ flex: 1 }}>
      <ProofLink occurrenceId={id} />
      <TaskShoppingLink occurrenceId={id} />
      <TaskDetailScreen occurrenceId={id}>
        <ProofButton occurrenceId={id} />
      </TaskDetailScreen>
    </View>
  );
}
