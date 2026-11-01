import type { PressableProps } from 'react-native';

/** Props for a `Pressable` with a `checkbox`, `radio` or `switch` role. Native has no keyboard to handle. */
export type SpaceActivation = Pick<PressableProps, 'onKeyDown'>;

/**
 * Space must activate a `checkbox`, `radio` or `switch` just as Enter does (WAI-ARIA), but
 * react-native-web only treats it as a press for `button`. Web handles it in `keyboard.web.ts`;
 * Metro picks that file there, and this no-op everywhere else.
 */
export function activateOnSpace(onActivate: (() => void) | undefined): SpaceActivation {
  void onActivate; // native has no keyboard
  return {};
}

/**
 * Call it in a component that lives exactly as long as a dialog is open: when that component
 * unmounts, focus returns to whatever had it when the dialog opened. Web only; native does it itself.
 */
export function useRestoreFocus(): void {}
