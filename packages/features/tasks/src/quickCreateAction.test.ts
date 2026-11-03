import { describe, expect, it } from 'vitest';
import { quickCreateAction } from './quickCreateAction';

describe('quickCreateAction', () => {
  it('waits while the contexts load, instead of reading the empty list as "no context"', () => {
    expect(quickCreateAction({ isPending: true, isError: false, count: 0 })).toBe('wait');
  });

  it('sends to "Novo contexto" only when the list settled empty', () => {
    expect(quickCreateAction({ isPending: false, isError: false, count: 0 })).toBe('newContext');
  });

  it('opens the sheet when there are contexts', () => {
    expect(quickCreateAction({ isPending: false, isError: false, count: 2 })).toBe('open');
    // A failed refetch keeps the cached list.
    expect(quickCreateAction({ isPending: false, isError: true, count: 1 })).toBe('open');
  });

  it('opens the sheet, with its error, when the load failed', () => {
    expect(quickCreateAction({ isPending: false, isError: true, count: 0 })).toBe('open');
  });
});
