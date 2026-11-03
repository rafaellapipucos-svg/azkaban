/** Same shape as `gamificationDefaults.level` in config, which core does not import. */
export type LevelCurve = { firstLevelXp: number; growth: number };

export type LevelInfo = {
  /** Starts at 1. */
  level: number;
  /** XP earned since the start of `level`. */
  xpIntoLevel: number;
  /** XP the whole step from `level` to `level + 1` costs, not what is left of it. */
  xpForNextLevel: number;
};

/**
 * Level of a total (ADR-0010 section 1). Level 1 starts at 0 and the step from `n` to `n + 1` costs
 * `round(firstLevelXp × growth^(n − 1))`, each step rounded on its own. Not stored anywhere: changing
 * the curve applies to everyone at once. A negative total, which compensation should never leave,
 * is level 1 with nothing in it.
 */
export function levelForXp(totalXp: number, curve: LevelCurve): LevelInfo {
  if (!(curve.firstLevelXp >= 1 && curve.growth >= 1)) throw new RangeError('invalid level curve');
  const cost = (level: number) => Math.round(curve.firstLevelXp * curve.growth ** (level - 1));
  let level = 1;
  let rest = Math.max(0, totalXp);
  while (rest >= cost(level)) {
    rest -= cost(level);
    level += 1;
  }
  return { level, xpIntoLevel: rest, xpForNextLevel: cost(level) };
}
