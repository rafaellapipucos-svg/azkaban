import { ContextFormScreen } from '@azkaban/feature-contexts';
import { useLocalSearchParams } from 'expo-router';

export default function NewContext() {
  const { area } = useLocalSearchParams<{ area?: string }>();
  return <ContextFormScreen areaId={area} />;
}
