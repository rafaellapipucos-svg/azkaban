import AsyncStorage from '@react-native-async-storage/async-storage';
import { setStringAsync } from 'expo-clipboard';
import { createURL } from 'expo-linking';
import { Platform } from 'react-native';

export { DateTimeInput } from './DateTimeInput';
export type { DateTimeInputAppearance, DateTimeInputProps } from './DateTimeInput';

export { activateOnSpace, useRestoreFocus, type SpaceActivation } from './keyboard';

export const storage = AsyncStorage;

export const isWeb = Platform.OS === 'web';

export const copyToClipboard = (text: string) => setStringAsync(text);

export const createAppLink = (path: string) => createURL(path);

export const deviceTimezone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;
