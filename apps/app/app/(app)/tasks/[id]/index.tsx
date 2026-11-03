import { TaskDetailScreen } from '@azkaban/feature-tasks';
import { useLocalSearchParams } from 'expo-router';

export default function TaskDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <TaskDetailScreen occurrenceId={id} />;
}
