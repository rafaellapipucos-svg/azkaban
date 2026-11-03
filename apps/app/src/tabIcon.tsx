import { Text } from 'react-native';

export const tabIcon = (emoji: string) =>
  function TabIcon() {
    return <Text aria-hidden>{emoji}</Text>;
  };
