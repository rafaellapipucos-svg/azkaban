import { describe, expect, it } from 'vitest';
import { safeInternalPath } from './safeInternalPath';

describe('safeInternalPath', () => {
  it('keeps in-app paths', () => {
    expect(safeInternalPath('/join/ABC')).toBe('/join/ABC');
  });

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
  ])('rejects %s', (path) => {
    expect(safeInternalPath(path)).toBeUndefined();
  });
});
