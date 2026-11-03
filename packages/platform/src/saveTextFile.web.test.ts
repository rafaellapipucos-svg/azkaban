import { afterEach, describe, expect, it, vi } from 'vitest';
import { saveTextFile } from './saveTextFile.web';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('saveTextFile (web)', () => {
  it('downloads the text under the file name and frees the URL afterwards', async () => {
    vi.useFakeTimers();
    const link = { href: '', download: '', click: vi.fn(), remove: vi.fn() };
    const append = vi.fn();
    const blobs: Blob[] = [];
    const revokeObjectURL = vi.fn();
    vi.stubGlobal('document', { createElement: () => link, body: { append } });
    vi.stubGlobal('URL', {
      createObjectURL: (blob: Blob) => {
        blobs.push(blob);
        return 'blob:1';
      },
      revokeObjectURL,
    });

    await saveTextFile('azkaban-dados-2026-11-03.json', '{"a":1}');
    expect(link).toMatchObject({ href: 'blob:1', download: 'azkaban-dados-2026-11-03.json' });
    expect(append).toHaveBeenCalledWith(link);
    expect(link.click).toHaveBeenCalledOnce();
    expect(link.remove).toHaveBeenCalledOnce();
    expect(await blobs[0]?.text()).toBe('{"a":1}');
    expect(revokeObjectURL).not.toHaveBeenCalled();
    vi.runAllTimers();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:1');
  });
});
