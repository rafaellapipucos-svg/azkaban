import { useSession } from '@azkaban/feature-auth';
import { JoinGroupScreen } from '@azkaban/feature-groups';
import { useLocalSearchParams } from 'expo-router';

export default function Join() {
  const { code } = useLocalSearchParams<{ code: string }>();
  const { session, loading } = useSession();
  return loading ? null : <JoinGroupScreen code={code} signedIn={!!session} />;
}
