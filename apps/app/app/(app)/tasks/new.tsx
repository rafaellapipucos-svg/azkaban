import { TaskFormScreen } from '@azkaban/feature-tasks';
import { useLocalSearchParams } from 'expo-router';

export default function NewTask() {
  const { from, title, context, day, time } = useLocalSearchParams<{
    from?: string;
    title?: string;
    context?: string;
    day?: string;
    time?: string;
  }>();
  return <TaskFormScreen duplicateOf={from} prefill={{ title, contextId: context, day, time }} />;
}
