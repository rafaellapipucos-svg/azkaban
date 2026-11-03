import { TaskFormScreen } from '@azkaban/feature-tasks';
import { useLocalSearchParams } from 'expo-router';

export default function EditTask() {
  const { id, scope } = useLocalSearchParams<{ id: string; scope?: string }>();
  return <TaskFormScreen occurrenceId={id} scope={scope} />;
}
