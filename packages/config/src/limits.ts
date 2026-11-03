// No imports: `pnpm db:check-permissions` loads this file directly in Node.

/**
 * Per-user limits the database enforces with `consume_rate_limit` (ADR-0012, section 4): a fixed
 * window per action, counted in `rate_limit_counters`. Mirrored in public.app_settings under the key
 * `rate_limit_rules`, so changing a value here needs a migration too. Values to confirm with the
 * human; each is far above what a person does by hand.
 */
export const rateLimitRules = {
  actions: {
    /** Every `insert` in `tasks` by a user, `edit_task` splits included (SEG6-2). */
    task_create: { limit: 200, windowSeconds: 3600 },
    /** `set_occurrence_status`. The offline queue replays within it (SEG4-1). */
    occurrence_status: { limit: 600, windowSeconds: 3600 },
    /** `create_shopping_list`, completed lists included (SEG7-2). */
    shopping_list_create: { limit: 30, windowSeconds: 3600 },
    /** Every `insert` in `group_invites` by a user. */
    invite_create: { limit: 30, windowSeconds: 86400 },
    /** `get_invite_preview`, which answers a group name for a code. */
    invite_lookup: { limit: 30, windowSeconds: 3600 },
    /** `account-export`, which reads every table and signs every photo. */
    data_export: { limit: 3, windowSeconds: 86400 },
  },
  /** Counters older than this are deleted by the daily job. At least the longest window. */
  counterRetentionHours: 48,
  /**
   * How long the database remembers a stepper `requestId` (ADR-0012, section 5). Longer than
   * `offlineDefaults.maxAgeHours`, so a replay never finds the id forgotten.
   */
  idempotencyRetentionHours: 48,
} as const;

/** Client only: the offline queue (ADR-0012, section 5). */
export const offlineDefaults = {
  /** A change waiting longer than this is dropped, with a notice. Server time decides lateness. */
  maxAgeHours: 24,
  /** Changes waiting at once. Past it, a tap fails with the usual "no connection" message. */
  maxItems: 200,
} as const;

/** Edge Functions only: export and deletion of the account (ADR-0012, sections 2 and 3). */
export const privacyDefaults = {
  /** `account-delete` needs a sign-in at most this old (`reauth_required`). */
  reauthMaxAgeMinutes: 15,
  /** Lifetime of the signed photo links inside an export. */
  exportPhotoUrlTtlSeconds: 3600,
  /** `account_deletions` rows older than this are pruned by the next deletion. */
  deletionLogRetentionDays: 365,
} as const;
