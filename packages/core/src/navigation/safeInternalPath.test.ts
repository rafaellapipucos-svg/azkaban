import { describe, expect, it } from 'vitest';
import { safeInternalPath } from './safeInternalPath';

// The package has no DOM or Node types; vitest runs on Node, which has both.
declare const URL: new (url: string, base: string) => { origin: string };
declare const URLSearchParams: new (init: string) => { get(name: string): string | null };

const origin = 'https://app.example';

describe('safeInternalPath', () => {
  // Still encoded, `%09` is plain text in the path and stays on the origin.
  it.each(['/join/ABC', '/a/b?c=1#d', '/%09/evil.com', `/${'a'.repeat(199)}`])(
    'keeps %s',
    (path) => {
      expect(safeInternalPath(path)).toBe(path);
      expect(new URL(path, origin).origin).toBe(origin);
    },
  );

  it.each([
    undefined,
    '',
    '/',
    'https://evil.example',
    '//evil.example',
    '/\\evil.example',
    '\\\\evil.example',
    '/a\\b',
    'join/ABC',
    '/\t/evil.com',
    '/\n/evil.com',
    '/\r/evil.com',
    '/a\u0000b',
    '/a\u007fb',
    '/a\u009fb',
    `/${'a'.repeat(200)}`,
  ])('rejects %j', (path) => {
    expect(safeInternalPath(path)).toBeUndefined();
  });

  // `?next=` arrives percent-encoded; the router decodes it before the screen sees it.
  it.each([
    ['/%09/evil.com', '/\t/evil.com'],
    ['/%0a/evil.com', '/\n/evil.com'],
    ['/%0d/evil.com', '/\r/evil.com'],
    ['/%5c/evil.com', '/\\/evil.com'],
    ['/%5cevil.com', '/\\evil.com'],
    ['%2F%2Fevil.com', '//evil.com'],
  ])('rejects ?next=%s after decoding', (encoded, decoded) => {
    const next = new URLSearchParams(`next=${encoded}`).get('next');
    expect(next).toBe(decoded);
    expect(new URL(decoded, origin).origin).not.toBe(origin);
    expect(safeInternalPath(decoded)).toBeUndefined();
  });
});
