import { DesignSystemScreen } from '@azkaban/ui';
import { Redirect } from 'expo-router';

export default function DesignSystem() {
  return __DEV__ ? <DesignSystemScreen /> : <Redirect href="/" />;
}
