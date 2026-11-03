import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { setStringAsync } from 'expo-clipboard';
import { createURL } from 'expo-linking';
import { Platform } from 'react-native';

export { DateTimeInput } from './DateTimeInput';
export type { DateTimeInputAppearance, DateTimeInputProps } from './DateTimeInput';

export { ProofCamera } from './ProofCamera';
export type {
  CameraFacing,
  CameraPermission,
  CameraStatus,
  CameraUnavailableReason,
  ProofCameraHandle,
  ProofCameraProps,
} from './ProofCamera';
export { PhotoError, photoDataUri, photoLimits } from './photo';
export type { PhotoErrorCode, PhotoLimits, ProofPhoto, ProofStamp } from './photo';
export { sha256Hex } from './sha256';
export { getLocationPermission, readLocation } from './geolocation';
export type {
  DeviceLocation,
  LocationPermission,
  LocationResult,
  ReadLocationOptions,
} from './geolocation';

export { activateOnSpace, useRestoreFocus, type SpaceActivation } from './keyboard';
export { useOnline } from './network';
export { useDocumentTitle } from './documentTitle';
export { readSessionValue, writeSessionValue } from './sessionValue';
export { shareText, type ShareResult } from './shareText';
export { canSaveTextFile, saveTextFile } from './saveTextFile';
export { canVibrate, vibrate } from './haptics';
export { canPlayTone, playTone, type Tone } from './celebrationSound';
export {
  currentPushSubscription,
  nativePushToken,
  onPushOpened,
  pushPermission,
  pushSupport,
  subscribePush,
  unsubscribePush,
} from './push';
export type { PushPermission, PushSubscriptionData, PushSupport } from './push';

export const storage = AsyncStorage;

export const isWeb = Platform.OS === 'web';

export const appVersion = Constants.expoConfig?.version ?? '0.0.0';

export const copyToClipboard = (text: string) => setStringAsync(text);

export const createAppLink = (path: string) => createURL(path);

export const deviceTimezone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;
