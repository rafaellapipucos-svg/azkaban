import { ShoppingListScreen } from '@azkaban/feature-shopping';
import { useLocalSearchParams } from 'expo-router';

export default function ShoppingList() {
  const { id, mode } = useLocalSearchParams<{ id: string; mode?: string }>();
  return <ShoppingListScreen listId={id} mode={mode} />;
}
