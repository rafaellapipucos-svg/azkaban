import { ShoppingHistoryScreen } from '@azkaban/feature-shopping';
import { useLocalSearchParams } from 'expo-router';

export default function ShoppingHistory() {
  const { group } = useLocalSearchParams<{ group?: string }>();
  return <ShoppingHistoryScreen groupId={group ?? null} />;
}
