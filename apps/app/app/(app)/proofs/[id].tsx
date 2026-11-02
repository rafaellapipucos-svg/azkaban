import { ProofReviewScreen } from '@azkaban/feature-proof';
import { useLocalSearchParams } from 'expo-router';

export default function ProofReview() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <ProofReviewScreen proofId={id} />;
}
