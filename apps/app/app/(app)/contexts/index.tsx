import { AreasScreen } from '@azkaban/feature-contexts';
import { useLocalSearchParams } from 'expo-router';

export default function Contexts() {
  const { area } = useLocalSearchParams<{ area?: string }>();
  return <AreasScreen areaKey={area} />;
}
