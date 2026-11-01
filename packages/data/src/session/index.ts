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
  const profile = useQuery({ queryKey: ['profile'], queryFn: profilesRepository.getMine });
  const groups = useQuery({ queryKey: ['groups'], queryFn: groupsRepository.listMine });
  const user = useMemo(
    () => ({
      id: profile.data?.id ?? '',
      memberships: (groups.data ?? []).map(({ id, role }) => ({ groupId: id, role })),
    }),
    [profile.data, groups.data],
  );
  return {
    user,
    groups: groups.data ?? [],
    timezone: profile.data?.timezone ?? defaults.timezone,
    ready: profile.isSuccess && groups.isSuccess,
  };
}
