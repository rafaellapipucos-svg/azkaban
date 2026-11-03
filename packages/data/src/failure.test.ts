import { describe, expect, it, vi } from 'vitest';
import { callFailure, withCallFailure } from './failure';
import { isTransientFailure } from './offline';

// The offline queue loads the device storage, which Node does not have.
vi.mock('@azkaban/platform', () => ({}));

const named = (error: Error, status: number | undefined) =>
  callFailure(withCallFailure(error, status));

describe('withCallFailure and callFailure', () => {
  it('names the limit: GoTrue and PostgREST answer 429, PostgREST with PT429', () => {
    expect(named(new Error('over_request_rate_limit'), 429)).toBe('rate_limited');
    expect(named(Object.assign(new Error('rate_limited'), { code: 'PT429' }), undefined)).toBe(
      'rate_limited',
    );
  });

  it('names a fetch that never reached the server (status 0) and the server down (5xx)', () => {
    expect(named(new Error('TypeError: Failed to fetch'), 0)).toBe('network');
    expect(named(new Error('Bad Gateway'), 502)).toBe('unavailable');
    expect(named(new Error('internal'), 500)).toBe('unavailable');
  });

  it('leaves the server’s own refusals as they came', () => {
    const wrong = new Error('Invalid login credentials');
    expect(withCallFailure(wrong, 400)).toBe(wrong);
    expect(withCallFailure(wrong, undefined)).toBe(wrong);
    expect(callFailure(wrong)).toBeNull();
    expect(callFailure(null)).toBeNull();
  });

  it('keeps the original as the cause, so the offline queue still tries again on 5xx', () => {
    const down = Object.assign(new Error('Bad Gateway'), { code: '' });
    const wrapped = withCallFailure(down, 502);
    expect(wrapped.cause).toBe(down);
    expect(isTransientFailure(wrapped)).toBe(true);
  });
});
