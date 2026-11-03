/**
 * Sets the browser tab's title to `"<screen> · <app>"` while the calling screen is focused, or to the
 * app's name with no `title`. Web only, in `documentTitle.web.ts`; native has no document.
 */
export function useDocumentTitle(title?: string): void {
  void title;
}
