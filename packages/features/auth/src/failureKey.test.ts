import { describe, expect, it, vi } from 'vitest';
import { failureKey } from './failureKey';

// The real `@azkaban/data`, without the device storage it loads, which Node does not have.
vi.mock('@azkaban/platform', () => ({}));

describe('failureKey', () => {
  it('has its own text over the limit, offline and with the server down', () => {
    expect(failureKey(new Error('rate_limited'), 'signIn.invalid')).toBe('errors.rate_limited');
    expect(failureKey(new Error('network'), 'signIn.invalid')).toBe('errors.network');
    expect(failureKey(new Error('unavailable'), 'signIn.invalid')).toBe('errors.unavailable');
  });

  it('falls back for what GoTrue itself refuses', () => {
    const wrong = Object.assign(new Error('Invalid login credentials'), { status: 400 });
    expect(failureKey(wrong, 'signIn.invalid')).toBe('signIn.invalid');
    expect(failureKey(null, 'errors.generic')).toBe('errors.generic');
  });
});
