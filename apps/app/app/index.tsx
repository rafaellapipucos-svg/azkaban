import { WelcomeScreen } from '@azkaban/feature-auth';
import { env } from '../src/env';

export default function Index() {
  return <WelcomeScreen appName={env.EXPO_PUBLIC_APP_NAME} />;
}
