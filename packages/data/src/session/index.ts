import { defaults } from '@azkaban/config';
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { groupsRepository } from '../groups';
import { profilesRepository } from '../profiles';

/**
 * Who is using the screen, in the shape `can()` and `deriveActors` take, and the zone their days
 * are counted in. The one place that owns the `['profile']` and `['groups']` cache keys, which
 * invalidation depends on (ADR-0006 section 4).
 */
export function useCurrentUser() {
  // Fresh for a minute: rows mounting after the first read reuse it, and every own change to the
  // profile or the groups invalidates the key (ADR-0012, section 10, QA8-3).
  const staleTime = defaults.currentUserStaleMs;
  const profile = useQuery({
    queryKey: ['profile'],
    queryFn: profilesRepository.getMine,
    staleTime,
  });
  const groups = useQuery({ queryKey: ['groups'], queryFn: groupsRepository.listMine, staleTime });
  const user = useMemo(
    () => ({
      id: profile.data?.id ?? '',
      memberships: (groups.data ?? []).map(({ id, role }) => ({ groupId: id, role })),
    }),
    [profile.data, groups.data],
  );
  return {
    user,
    displayName: profile.data?.displayName ?? '',
    groups: groups.data ?? [],
    timezone: profile.data?.timezone ?? defaults.timezone,
    ready: profile.isSuccess && groups.isSuccess,
  };
}
