import { colorScheme } from 'nativewind';
import { useEffect } from 'react';
import { Platform, useColorScheme } from 'react-native';

// Native follows the system on its own; web needs the dark class toggled to match.
export function useSystemColorScheme() {
  const system = useColorScheme();
  useEffect(() => {
    if (Platform.OS === 'web') colorScheme.set(system === 'dark' ? 'dark' : 'light');
  }, [system]);
}
