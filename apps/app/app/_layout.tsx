import '../global.css';
import { initI18n } from '@azkaban/i18n';
import { useSystemColorScheme } from '@azkaban/ui';
import { Nunito_600SemiBold, Nunito_800ExtraBold, useFonts } from '@expo-google-fonts/nunito';
import { Stack } from 'expo-router';

initI18n();

export default function RootLayout() {
  useSystemColorScheme();
  const [fontsLoaded] = useFonts({ Nunito_600SemiBold, Nunito_800ExtraBold });
  if (!fontsLoaded) return null;
  return <Stack screenOptions={{ headerShown: false }} />;
}
