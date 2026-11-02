// No imports: `pnpm db:check-permissions` loads this file directly in Node.

/**
 * Rules the database reads (ADR-0008). Mirrored in public.app_settings under the key
 * `notification_rules`, so changing a value here needs a migration too. The bell (in-app) is not
 * here: it always records, and these rules are about the channels that ring outside the app.
 */
export const notificationRules = {
  /** Channels the dispatcher delivers today. `whatsapp` joins in Phase 5, with its opt-in. */
  activeChannels: ['web_push'],
  /** What each type does on a channel the user never chose. A row in notification_preferences wins. */
  defaultChannels: {
    task_reminder: { web_push: true, whatsapp: false },
    occurrence_missed: { web_push: false, whatsapp: false },
    occurrence_resolved: { web_push: false, whatsapp: false },
    proof_in_review: { web_push: true, whatsapp: false },
    proof_disputed: { web_push: true, whatsapp: false },
  },
  /** Default of a new profile, local time of the profile. Both null in the profile means none. */
  defaultQuietHours: { start: '22:00', end: '07:00' },
  /** How far back the reminder scan looks, so a minute the cron missed is not a lost reminder. */
  reminderCatchUpMinutes: 60,
  /** A new browser past this replaces the oldest one. */
  maxPushSubscriptionsPerUser: 10,
  /**
   * The only hosts a subscription may point to: the dispatcher POSTs to it, so any other host would
   * be a request from our server to wherever a client chose. A host matches itself or a subdomain.
   */
  pushEndpointHosts: [
    'fcm.googleapis.com',
    'updates.push.services.mozilla.com',
    'web.push.apple.com',
    'notify.windows.com',
  ],
  /** The bell keeps a notification this long, then it is deleted with its outbox rows. */
  inboxRetentionDays: 30,
} as const;

/** Dispatcher values, passed by the function to the database, with nothing to mirror. */
export const notificationDefaults = {
  /** Outbox rows claimed per call, and calls stop at the time budget, well under the 150 s limit. */
  dispatchBatchSize: 100,
  dispatchBudgetMs: 20_000,
  /** A row claimed and not reported within this goes back to the queue. */
  leaseSeconds: 120,
  /** The n-th retry waits `baseDelaySeconds × 2^(n-1)`, capped. After `maxAttempts`, `failed`. */
  retry: { maxAttempts: 5, baseDelaySeconds: 60, maxDelaySeconds: 3600 },
  /** A row still undelivered this long after `scheduled_for` gives up as `expired`. */
  maxDelayHours: 24,
  /** Web Push TTL. A reminder lives only until its task starts, and never less than a minute. */
  pushTtlSeconds: 86_400,
  minPushTtlSeconds: 60,
} as const;
