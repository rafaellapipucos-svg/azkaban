/** Screen-only values of the feature. The rules are in `@azkaban/config` (gamification.ts). */
export const gamificationUi = {
  /** Rows that arrive within this window are one burst: one read of `user_stats`, one celebration. */
  burstMs: 600,
  /**
   * A burst this soon after a card opened joins it instead of replacing it: the parts of one save can
   * arrive further apart than `burstMs` (QA6C-3). A later one, the next task done, gets its own card.
   */
  joinMs: 3000,
  /** A celebration card closes by itself after this, unless the person closes it first. */
  cardMs: 6000,
  /** A short double buzz. */
  hapticPattern: [30, 60, 30],
  /** Two rising notes, quiet. */
  tone: { notes: [660, 880], noteMs: 120, volume: 0.15 },
  /** Days shown under "Últimos dias" in the profile, today included. */
  recentDays: 7,
  /** How often "teto atingido" asks again, since room comes back as events leave the 24 h window. */
  capRefreshMs: 5 * 60_000,
} as const;
