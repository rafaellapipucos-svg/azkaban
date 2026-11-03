// No imports: `pnpm db:check-permissions` loads this file directly in Node.

/**
 * Rules the database applies (ADR-0010). Mirrored in public.app_settings under the key
 * `gamification_rules`, so changing a value here needs a migration too. The base XP of an occurrence
 * stays in `taskRules.xp`. Values marked "a confirmar" wait for the human (section 13).
 */
export const gamificationRules = {
  xp: {
    /** Flat, on top of the base, for an occurrence in `done` with a current proof. A confirmar. */
    proofBonus: 5,
    /** Flat, once per local day of the profile that is perfect. Outside the daily cap. A confirmar. */
    perfectDayBonus: 20,
    /**
     * Most XP of the capped reasons one user nets in one local day of the profile, counted when the
     * event is written. Closes mass XP (ADR-0005, section 11). A confirmar.
     */
    dailyCap: 300,
  },
  /** A day meets the goal when `completed × 100 ≥ planned × percent`. A confirmar. */
  goal: { percent: 80, countPartial: true },
  streak: {
    /** A closed day with nothing planned neither counts nor breaks. */
    emptyDayKeepsStreak: true,
    /** One freeze every time the streak reaches a multiple of this, up to `maxFreezes`. A confirmar. */
    freezeEveryDays: 7,
    maxFreezes: 2,
  },
  ranking: {
    /** When `groups.settings.rankingEnabled` is absent. An unknown type is `false`. A confirmar. */
    defaultEnabledByGroupType: { family: true, company: false, other: false },
  },
  /** The job that closes local days. Days further back than `maxCatchUpDays` are not recounted. */
  closeJob: { batchSize: 200, maxCatchUpDays: 30 },
} as const;

/** Client values, with nothing to mirror. */
export const gamificationDefaults = {
  /** XP from level n to n + 1 is `round(firstLevelXp × growth^(n - 1))`. Level 1 starts at 0. */
  level: { firstLevelXp: 100, growth: 1.25 },
  /** Per device. Sound is off until the user turns it on. A confirmar. */
  celebration: { sound: false, haptics: true },
  /** The ranking week, as `WeekStart` in core: 1 is Monday. */
  rankingWeekStartsOn: 1,
  /** Streak days that get a milestone celebration. */
  streakMilestones: [7, 30, 100, 365],
} as const;
