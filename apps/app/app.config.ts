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
  plugins: [
    'expo-router',
    'expo-font',
    [
      'expo-camera',
      {
        cameraPermission: 'A câmera serve só para tirar a foto que comprova uma tarefa.',
        // No video here: left out, the plugin declares the microphone on iOS anyway.
        microphonePermission: false,
        recordAudioAndroid: false,
      },
    ],
    [
      'expo-location',
      {
        locationWhenInUsePermission:
          'A localização é lida só na hora da foto, e só quando o contexto da tarefa tem um local. Guardamos a distância até ele, nunca as coordenadas.',
        // One reading, never in the background (ADR-0007, section 7).
        locationAlwaysAndWhenInUsePermission: false,
        locationAlwaysPermission: false,
      },
    ],
  ],
};

export default config;
