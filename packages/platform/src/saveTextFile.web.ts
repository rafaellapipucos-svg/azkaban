export const canSaveTextFile = true;

/** A `Blob` behind an `<a download>`, clicked once, so the browser saves it as `fileName`. */
export async function saveTextFile(fileName: string, text: string): Promise<void> {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  // Revoked on the next turn: some browsers read the URL after `click` returns.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
