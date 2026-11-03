import { QueryClient } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { isTransientFailure } from '../offline';
import {
  shoppingAddItemAction,
  shoppingAdjustAction,
  shoppingErrorCode,
  shoppingRepository,
  toItemOrNull,
} from './index';

// The client pulls the native storage in; these checks never reach the network. A plain query
// answers with `current`, `.single()` with `single`, `.maybeSingle()` with `read`, and every RPC
// with `rpc`, after noting its arguments in `calls`.
const answer = vi.hoisted(() => ({
  current: { data: [] as unknown[] | null, error: null as unknown },
  single: { data: null as unknown, error: null as unknown },
  read: { data: null as unknown, error: null as unknown },
  rpc: { data: null as unknown, error: null as unknown },
  calls: [] as { name: string; args: Record<string, unknown> }[],
}));
vi.mock('../client', () => {
  const query: Record<string, unknown> = {};
  for (const step of ['from', 'update', 'delete', 'insert', 'eq']) query[step] = () => query;
  query.select = () => ({
    ...query,
    then: (resolve: (value: unknown) => unknown) => resolve(answer.current),
  });
  query.single = () => Promise.resolve(answer.single);
  query.maybeSingle = () => Promise.resolve(answer.read);
  query.rpc = (name: string, args: Record<string, unknown>) => {
    answer.calls.push({ name, args });
    return Promise.resolve(answer.rpc);
  };
  return { db: () => query };
});
vi.mock('@azkaban/platform', () => ({ storage: {} }));

const id = (n: number) => `7c9e6679-7425-40de-944b-e07fc1f90a${String(n).padStart(2, '0')}`;
const itemRow = {
  id: id(1),
  list_id: id(2),
  catalog_item_id: null,
  name: 'Pão de queijo',
  category: 'bakery',
  quantity: 1,
  unit: 'unit',
  emoji: null,
  note: null,
  added_by: id(3),
  added_at: '2026-11-03T12:00:00Z',
  checked_at: null,
  checked_by: null,
};
const typed = {
  id: id(1),
  listId: id(2),
  catalogItemId: null,
  name: 'Pão de queijo',
  category: 'bakery',
  quantity: 1,
  unit: 'unit',
  emoji: null,
  note: null,
} as const;
const context = () => ({ client: new QueryClient(), meta: undefined });

beforeEach(() => {
  answer.calls = [];
  answer.read = { data: null, error: null };
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

describe('rate_limited', () => {
  it('is what PT429 means on creating a list, and the queue does not try it again', async () => {
    const limited = { code: 'PT429', message: 'rate_limited', hint: '120', details: null };
    expect(shoppingErrorCode(limited)).toBe('rate_limited');
    answer.rpc = { data: null, error: limited };
    const failure = await shoppingRepository
      .createList({ groupId: null, name: 'Feira' })
      .catch((error: unknown) => error);
    expect(shoppingErrorCode(failure)).toBe('rate_limited');
    expect(isTransientFailure(failure)).toBe(false);
  });
});

describe('the stepper', () => {
  it('sends the request id on both paths, and nothing when there is none', async () => {
    answer.rpc = { data: itemRow, error: null };
    await shoppingRepository.adjustQuantity({ itemId: id(1), delta: 1, requestId: id(4) });
    await shoppingRepository.adjustQuantity({
      listId: id(2),
      catalogItemId: id(5),
      delta: 1,
      requestId: id(6),
    });
    await shoppingRepository.adjustQuantity({ itemId: id(1), delta: -1 });
    expect(answer.calls.map(({ name, args }) => [name, args.p_request_id])).toEqual([
      ['adjust_shopping_item_quantity', id(4)],
      ['add_catalog_item_to_list', id(6)],
      ['adjust_shopping_item_quantity', undefined],
    ]);
    expect('p_request_id' in (answer.calls[2]?.args ?? {})).toBe(false);
  });

  it('drops variables from the disk that no longer match the contract', async () => {
    await expect(
      shoppingAdjustAction.mutationFn({ itemId: 'nope', delta: 1 } as never, context()),
    ).rejects.toThrow('invalid');
    expect(answer.calls).toEqual([]);
  });
});

describe('a typed item through the queue', () => {
  const duplicate = { code: '23505', message: 'duplicate key value violates unique constraint' };
  const add = () => shoppingAddItemAction.mutationFn(typed, context());

  it('counts a replay as done when the row with its id is there', async () => {
    answer.single = { data: null, error: duplicate };
    answer.read = { data: itemRow, error: null };
    await expect(add()).resolves.toMatchObject({ id: id(1), name: 'Pão de queijo' });
  });

  it('keeps the failure when the id is not there, and for any other refusal', async () => {
    answer.single = { data: null, error: duplicate };
    await expect(add()).rejects.toThrow('shopping_error');
    answer.single = { data: null, error: { code: 'P0001', message: 'list_completed' } };
    answer.read = { data: itemRow, error: null };
    const failure = await add().catch((error: unknown) => error);
    expect(shoppingErrorCode(failure)).toBe('list_completed');
    expect(isTransientFailure(failure)).toBe(false);
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
