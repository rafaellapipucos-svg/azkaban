import type { GroupSettings } from '@azkaban/contracts';

/**
 * Whether a group shows the weekly ranking (ADR-0010, section 6): `settings.rankingEnabled` when set,
 * else the default of the group type, and off for a type the defaults do not know. Same shape as
 * `gamificationRules.ranking.defaultEnabledByGroupType` in config, which core does not import.
 */
export function rankingEnabled(
  group: { type: string; settings?: GroupSettings | null },
  defaultByType: Readonly<Record<string, boolean>>,
): boolean {
  return (
    group.settings?.rankingEnabled ??
    (Object.hasOwn(defaultByType, group.type) ? defaultByType[group.type] === true : false)
  );
}
