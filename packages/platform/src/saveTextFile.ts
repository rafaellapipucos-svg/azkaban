/** Whether `saveTextFile` works here. Native has no way yet (until F8-7): the screen says to use the web. */
export const canSaveTextFile: boolean = false;

/** Saves text as a downloaded file. Web uses `saveTextFile.web.ts`. */
export async function saveTextFile(fileName: string, text: string): Promise<void> {
  void fileName;
  void text;
  throw new Error('unsupported');
}
