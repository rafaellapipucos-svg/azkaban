import { describe, expect, it } from 'vitest';
import { cacheBelongsToAnother } from './userChange';

describe('cacheBelongsToAnother', () => {
  it('keeps the cache while nobody had signed in yet', () => {
    expect(cacheBelongsToAnother(null, null)).toBe(false);
    expect(cacheBelongsToAnother(null, 'a')).toBe(false);
  });

  it('keeps the cache for the same user, as on a token refresh', () => {
    expect(cacheBelongsToAnother('a', 'a')).toBe(false);
  });

  it('drops the cache when the session ends or another user comes in', () => {
    expect(cacheBelongsToAnother('a', null)).toBe(true);
    expect(cacheBelongsToAnother('a', 'b')).toBe(true);
  });
});
