/**
 * Whether the device says it has a connection. Web reads the browser, in `network.web.ts`, which Metro
 * picks there.
 */
// ponytail: native has no signal without NetInfo, so a failed request says it instead. F8-5 adds it.
export function useOnline(): boolean {
  return true;
}
