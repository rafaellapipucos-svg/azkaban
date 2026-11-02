import { ProofCaptureScreen } from '@azkaban/feature-proof';
import { useLocalSearchParams } from 'expo-router';

export default function TaskProof() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <ProofCaptureScreen occurrenceId={id} />;
}
