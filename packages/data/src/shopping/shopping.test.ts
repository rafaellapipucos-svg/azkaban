import { describe, expect, it, vi } from 'vitest';
import { shoppingErrorCode, shoppingRepository, toItemOrNull } from './index';

// The client pulls the native storage in; these checks never reach the network. Every query
// answers with `answer`.
const answer = vi.hoisted(() => ({
  current: { data: [] as unknown[] | null, error: null as unknown },
}));
vi.mock('../client', () => {
  const query: Record<string, unknown> = {};
  for (const step of ['from', 'update', 'delete', 'eq']) query[step] = () => query;
  query.select = () => Promise.resolve(answer.current);
  return { db: () => query };
});

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

describe('managing a list', () => {
  it('says forbidden when RLS leaves no row to rename or delete', async () => {
    answer.current = { data: [], error: null };
    await expect(shoppingRepository.deleteList('l1')).rejects.toThrow('forbidden');
    await expect(shoppingRepository.updateList('l1', { name: 'Feira' })).rejects.toThrow(
      'forbidden',
    );
  });

  it('passes the database code on, and resolves when the row was touched', async () => {
    answer.current = { data: null, error: { message: 'list_completed', code: 'P0001' } };
    await expect(shoppingRepository.updateList('l1', { name: 'Feira' })).rejects.toThrow(
      'list_completed',
    );
    answer.current = { data: [{ id: 'l1' }], error: null };
    await expect(shoppingRepository.deleteList('l1')).resolves.toBeUndefined();
  });
});
