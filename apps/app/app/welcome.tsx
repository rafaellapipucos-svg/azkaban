import { WelcomeScreen } from '@azkaban/feature-auth';
import { env } from '../src/env';

export default function Welcome() {
  return <WelcomeScreen appName={env.EXPO_PUBLIC_APP_NAME} />;
}
