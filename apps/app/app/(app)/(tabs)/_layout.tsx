import { Tabs } from 'expo-router';
import { AppTabBar } from '../../../src/AppTabBar';

// Hoje, the areas, Calendário and Perfil. The bar is custom because the areas come from the database.
export default function TabsLayout() {
  return (
    <Tabs tabBar={(props) => <AppTabBar {...props} />} screenOptions={{ headerShown: false }}>
      <Tabs.Screen name="index" />
      <Tabs.Screen name="area/[areaKey]" />
      <Tabs.Screen name="calendar" />
      <Tabs.Screen name="profile" />
    </Tabs>
  );
}
