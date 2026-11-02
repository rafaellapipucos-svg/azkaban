import { ProofButton, ProofLink } from '@azkaban/feature-proof';
import { TaskDetailScreen } from '@azkaban/feature-tasks';
import { useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';

// Features do not import each other, so the route composes the photo flow into the task's page.
export default function TaskDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <View style={{ flex: 1 }}>
      <ProofLink occurrenceId={id} />
      <TaskDetailScreen occurrenceId={id}>
        <ProofButton occurrenceId={id} />
      </TaskDetailScreen>
    </View>
  );
}
