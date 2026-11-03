import { QueryClient } from '@tanstack/react-query';
import { expect, it, vi } from 'vitest';
import { gamificationKey, statsQuery } from './hooks';

const { getStats } = vi.hoisted(() => ({ getStats: vi.fn(async () => null) }));
vi.mock('./source', () => ({ gamificationSource: { getStats } }));
vi.mock('@azkaban/data', () => ({ useCurrentUser: () => ({}) }));
vi.mock('@azkaban/platform', () => ({ canPlayTone: () => false, canVibrate: () => false }));

it('reads user_stats once for the baseline and the chip, and again after an invalidation', async () => {
  const client = new QueryClient();
  await client.fetchQuery(statsQuery); // CelebrationHost baseline
  await client.fetchQuery(statsQuery); // StreakChip mounting after it answered
  expect(getStats).toHaveBeenCalledTimes(1);
  await client.invalidateQueries({ queryKey: gamificationKey });
  await client.fetchQuery(statsQuery);
  expect(getStats).toHaveBeenCalledTimes(2);
});
