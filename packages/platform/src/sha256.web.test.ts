import { describe, expect, it } from 'vitest';
import { sha256Hex } from './sha256.web';

const text = (s: string) => new TextEncoder().encode(s);

describe('sha256Hex (web)', () => {
  it('matches the published vectors', async () => {
    expect(await sha256Hex(new Uint8Array(0))).toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    );
    expect(await sha256Hex(text('abc'))).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });

  it('hashes the bytes of a view, not the buffer behind it', async () => {
    const whole = text('xxabcxx');
    expect(await sha256Hex(whole.subarray(2, 5))).toBe(await sha256Hex(text('abc')));
  });
});
