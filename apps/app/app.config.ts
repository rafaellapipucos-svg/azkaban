import type { ExpoConfig } from 'expo/config';

const config: ExpoConfig = {
  name: process.env.EXPO_PUBLIC_APP_NAME ?? 'Azkaban',
  slug: 'azkaban',
  scheme: process.env.EXPO_PUBLIC_APP_SCHEME ?? 'azkaban',
  version: '0.0.0',
  orientation: 'portrait',
  icon: './assets/icon.png',
  userInterfaceStyle: 'automatic',
  web: {
    bundler: 'metro',
    // `single` ignores `app/+html.tsx`, so the document's language comes from here (the default is en).
    output: 'single',
    lang: 'pt-BR',
    favicon: './assets/favicon.png',
  },
  plugins: ['expo-router', 'expo-font'],
};

export default config;
