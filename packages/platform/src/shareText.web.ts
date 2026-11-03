import type { ShareResult } from './shareText';

/**
 * Web Share API where there is one (phones, Safari, Chrome on Windows), else the clipboard. Only
 * `text`, no `title`: some targets, WhatsApp among them, glue the title to the text.
 */
export async function shareText(text: string): Promise<ShareResult> {
  if (typeof navigator.share === 'function') {
    try {
      await navigator.share({ text });
      return 'shared';
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return 'dismissed';
      // NotAllowedError (no user gesture left, blocked by policy): copying still works.
    }
  }
  await navigator.clipboard.writeText(text);
  return 'copied';
}
