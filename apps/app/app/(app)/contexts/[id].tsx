import { ContextFormScreen } from '@azkaban/feature-contexts';
import { useLocalSearchParams } from 'expo-router';

export default function EditContext() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <ContextFormScreen contextId={id} />;
}
