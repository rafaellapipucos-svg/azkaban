import { AreaScreen } from '@azkaban/feature-tasks';
import { useLocalSearchParams } from 'expo-router';

export default function Area() {
  const { areaKey } = useLocalSearchParams<{ areaKey: string }>();
  // The key restarts the screen's state (the chosen sub-tab) when the area changes.
  return <AreaScreen key={areaKey} areaKey={areaKey} />;
}
