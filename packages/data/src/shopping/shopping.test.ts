import { describe, expect, it, vi } from 'vitest';
import { shoppingErrorCode, toItemOrNull } from './index';

// The client pulls the native storage in; these checks never reach the network.
vi.mock('../client', () => ({}));

describe('shopping repository mapping', () => {
  it('reads the code the database raised, and nothing else', () => {
    expect(shoppingErrorCode({ message: 'list_completed', code: 'P0001' })).toBe('list_completed');
    expect(shoppingErrorCode({ message: 'permission denied for table', code: '42501' })).toBeNull();
    expect(shoppingErrorCode(null)).toBeNull();
  });

  it('treats a gone item as null, whether PostgREST sends null or a row of nulls', () => {
    expect(toItemOrNull(null)).toBeNull();
    const empty = Object.fromEntries(
      ['id', 'list_id', 'name', 'quantity'].map((key) => [key, null]),
    ) as unknown as Parameters<typeof toItemOrNull>[0];
    expect(toItemOrNull(empty)).toBeNull();
  });
});
