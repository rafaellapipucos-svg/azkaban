import { ShoppingCatalogScreen } from '@azkaban/feature-shopping';
import { useLocalSearchParams } from 'expo-router';

export default function ShoppingCatalog() {
  const { group } = useLocalSearchParams<{ group?: string }>();
  return <ShoppingCatalogScreen groupId={group ?? null} />;
}
