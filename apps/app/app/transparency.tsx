import { TransparencyScreen } from '@azkaban/feature-groups';
import { Stack, useLocalSearchParams } from 'expo-router';
import { BackHeader } from '../src/BackHeader';

// Outside (app) so it reads signed out too, and from the invite before joining (ADR-0012, section 7).
export default function Transparency() {
  const { groupId, groupType } = useLocalSearchParams<{ groupId?: string; groupType?: string }>();
  return (
    <>
      <Stack.Screen options={{ headerShown: true, header: () => <BackHeader /> }} />
      <TransparencyScreen groupId={groupId} groupType={groupType} />
    </>
  );
}
