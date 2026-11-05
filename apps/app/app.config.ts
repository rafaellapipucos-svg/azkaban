import type { ExpoConfig } from 'expo/config';

// Chosen by the human (ADR-0012, section 11, BL-40). After the first store build they only change with a
// new app in the stores; iOS repeats the Android one so the two never diverge.
const iosBundleId = process.env.APP_IOS_BUNDLE_ID ?? 'com.tabolao.app';
const androidPackage = process.env.APP_ANDROID_PACKAGE ?? 'com.tabolao.app';
// Expo cannot load the TypeScript tokens from here, so these repeat them; public.test.ts compares.
const colors = { primary: '#6B2FE0', background: '#FBF8FF', backgroundDark: '#16121F' };
// From the Expo account (`eas init`). Without it the app builds, and native push has no token.
const easProjectId = process.env.EAS_PROJECT_ID;

const config: ExpoConfig = {
  name: process.env.EXPO_PUBLIC_APP_NAME ?? 'Azkaban',
  slug: 'azkaban',
  // Deep links: expo-router maps `azkaban://<path>` to the same routes as the web, the notification
  // addresses included (`/tasks/<id>`, `/tasks/<id>/proof`, `/proofs/<id>`, `/notifications`).
  scheme: process.env.EXPO_PUBLIC_APP_SCHEME ?? 'azkaban',
  version: '0.0.0',
  orientation: 'portrait',
  // The Broto art, copied from packages/ui/assets/brand (`pnpm --filter @azkaban/ui brand`).
  icon: './assets/icon.png',
  userInterfaceStyle: 'automatic',
  ios: { bundleIdentifier: iosBundleId, supportsTablet: true },
  android: {
    package: androidPackage,
    adaptiveIcon: {
      foregroundImage: './assets/android-icon-foreground.png',
      monochromeImage: './assets/android-icon-monochrome.png',
      backgroundColor: colors.background,
    },
  },
  web: {
    bundler: 'metro',
    // `single` ignores `app/+html.tsx`, so the document's language comes from here (the default is en).
    output: 'single',
    lang: 'pt-BR',
    favicon: './assets/favicon.png',
  },
  extra: easProjectId ? { eas: { projectId: easProjectId } } : {},
  plugins: [
    'expo-router',
    'expo-font',
    [
      'expo-splash-screen',
      {
        image: './assets/splash-icon.png',
        imageWidth: 200,
        resizeMode: 'contain',
        backgroundColor: colors.background,
        dark: { image: './assets/splash-icon.png', backgroundColor: colors.backgroundDark },
      },
    ],
    // Compiles without Firebase or Apple: receiving needs FCM and APNs credentials in EAS (human).
    ['expo-notifications', { icon: './assets/notification-icon.png', color: colors.primary }],
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
