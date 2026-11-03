import { AreaScreen } from '@azkaban/feature-tasks';
import { useLocalSearchParams, useRouter } from 'expo-router';

export default function Area() {
  const { areaKey } = useLocalSearchParams<{ areaKey: string }>();
  const router = useRouter();
  // The key restarts the screen's state (the chosen sub-tab) when the area changes.
  return (
    <AreaScreen
      key={areaKey}
      areaKey={areaKey}
      onProof={(id) => router.push(`/tasks/${id}/proof`)}
    />
  );
}
