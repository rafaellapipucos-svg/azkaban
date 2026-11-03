import { Share } from 'react-native';

/** `copied`: no share sheet in this browser, so the text went to the clipboard; say so on screen. */
export type ShareResult = 'shared' | 'copied' | 'dismissed';

/** Hands plain text to the system share sheet. Web uses `shareText.web.ts`. */
export async function shareText(text: string): Promise<ShareResult> {
  const { action } = await Share.share({ message: text });
  return action === Share.dismissedAction ? 'dismissed' : 'shared';
}
