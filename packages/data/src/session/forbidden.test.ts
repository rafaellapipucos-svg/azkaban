import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';
import { isForbidden, refreshRolesOnForbidden } from './forbidden';

describe('isForbidden', () => {
  it('reads an RPC’s forbidden, at any depth of cause, and the 42501 of RLS', () => {
    expect(isForbidden(new Error('forbidden'))).toBe(true);
    expect(isForbidden({ code: 'forbidden' })).toBe(true);
    expect(isForbidden(new Error('task_error', { cause: { message: 'forbidden' } }))).toBe(true);
    expect(isForbidden({ code: '42501', message: 'new row violates row-level security' })).toBe(
      true,
    );
  });

  it('ignores the other failures', () => {
    expect(isForbidden(new Error('rate_limited'))).toBe(false);
    expect(isForbidden(null)).toBe(false);
    expect(isForbidden('forbidden')).toBe(false);
  });
});

describe('refreshRolesOnForbidden', () => {
  // A client with the roles read and fresh, as `useCurrentUser` leaves them for a minute.
  const setup = () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    client.setQueryData(['groups'], []);
    client.setQueryData(['group-members', 'g1'], []);
    const stop = refreshRolesOnForbidden(client);
    const stale = (key: string[]) => client.getQueryState(key)?.isInvalidated;
    return { client, stop, stale };
  };
  const fail = (error: Error) => () => Promise.reject(error);

  it('marks the roles stale when a read is refused', async () => {
    const { client, stop, stale } = setup();
    await client
      .fetchQuery({ queryKey: ['team', 'g1'], queryFn: fail(new Error('forbidden')) })
      .catch(() => undefined);
    expect(stale(['groups'])).toBe(true);
    expect(stale(['group-members', 'g1'])).toBe(true);
    stop();
  });

  it('marks them stale when a change is refused', async () => {
    const { client, stop, stale } = setup();
    const refused = client.getMutationCache().build(client, {
      mutationFn: fail(new Error('task_error', { cause: { message: 'forbidden' } })),
    });
    await refused.execute(undefined).catch(() => undefined);
    expect(stale(['groups'])).toBe(true);
    stop();
  });

  it('leaves them for other failures, for the role reads themselves and once stopped', async () => {
    const { client, stop, stale } = setup();
    await client
      .fetchQuery({ queryKey: ['team', 'g1'], queryFn: fail(new Error('network')) })
      .catch(() => undefined);
    await client
      .fetchQuery({ queryKey: ['group-members', 'g2'], queryFn: fail(new Error('forbidden')) })
      .catch(() => undefined);
    expect(stale(['groups'])).toBe(false);
    stop();
    await client
      .fetchQuery({ queryKey: ['team', 'g2'], queryFn: fail(new Error('forbidden')) })
      .catch(() => undefined);
    expect(stale(['groups'])).toBe(false);
  });
});
