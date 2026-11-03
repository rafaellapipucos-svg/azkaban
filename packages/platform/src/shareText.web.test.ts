import { afterEach, describe, expect, it, vi } from 'vitest';
import { shareText } from './shareText.web';

function stub(share?: (data: object) => Promise<void>) {
  const writeText = vi.fn(async (text: string) => void text);
  vi.stubGlobal('navigator', { share, clipboard: { writeText } });
  return writeText;
}

afterEach(() => vi.unstubAllGlobals());

describe('shareText (web)', () => {
  it('opens the share sheet with the text only', async () => {
    const share = vi.fn(async (data: object) => void data);
    const writeText = stub(share);
    expect(await shareText('Mercado')).toBe('shared');
    expect(share).toHaveBeenCalledWith({ text: 'Mercado' });
    expect(writeText).not.toHaveBeenCalled();
  });

  it('copies when the browser has no share sheet', async () => {
    const writeText = stub();
    expect(await shareText('Mercado')).toBe('copied');
    expect(writeText).toHaveBeenCalledWith('Mercado');
  });

  it('does nothing more when the person closes the sheet', async () => {
    const writeText = stub(async () => {
      throw new DOMException('closed', 'AbortError');
    });
    expect(await shareText('Mercado')).toBe('dismissed');
    expect(writeText).not.toHaveBeenCalled();
  });

  it('copies when the browser refuses to share', async () => {
    const writeText = stub(async () => {
      throw new DOMException('policy', 'NotAllowedError');
    });
    expect(await shareText('Mercado')).toBe('copied');
    expect(writeText).toHaveBeenCalledWith('Mercado');
  });
});
