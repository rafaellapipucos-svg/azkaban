// No imports: `pnpm db:check-permissions` loads this file directly in Node.

/**
 * Rules the database reads (ADR-0009). Mirrored in public.app_settings under the key `whatsapp_rules`,
 * so changing a value here needs a migration too.
 */
export const whatsappRules = {
  /** Raise it when the opt-in notice changes, so everyone reads the new text before the next message. */
  consentVersion: 1,
  /** Phone verification by a code sent through WhatsApp itself (ADR-0009, section 2). */
  verification: {
    codeLength: 6,
    /** Also the TTL of the authentication template, so a late message never brings a dead code. */
    codeTtlMinutes: 10,
    /** Wrong tries for one code. Then it dies and a new one is needed. */
    maxAttempts: 5,
    resendSeconds: 60,
    /** Rolling 24 hours. Each code is a paid message and lands on someone's phone. */
    maxSendsPerUserPerDay: 5,
    maxSendsPerPhonePerDay: 5,
    /** Rows live this long, enough for the rolling day of the limits. */
    retentionHours: 48,
  },
  dailySummary: {
    /** Default of a new profile, local time of the profile. */
    defaultTime: '08:00',
    defaultDeadlineDays: 7,
    maxDeadlineDays: 30,
    /** After the chosen time, how long a missed cron may still send today's summary. */
    catchUpMinutes: 120,
    /** Profiles enqueued per run of the job, every minute. */
    batchSize: 500,
    /** Rows per list in the source; `totals` has the full counts. */
    maxItems: { today: 30, overdue: 10, deadlines: 10 },
  },
  /** Days a row of `whatsapp_messages` lives, like the bell. */
  messageRetentionDays: 30,
  /** Days a row of `whatsapp_console_messages` lives. Local and CI only. */
  consoleRetentionDays: 1,
} as const;

/** Function defaults, with nothing for the database to mirror. */
export const whatsappDefaults = {
  /** Cloud API. The version is the one the docs showed on 2026-11-03; raise it with a test run. */
  graphApiBaseUrl: 'https://graph.facebook.com',
  graphApiVersion: 'v26.0',
  sendTimeoutMs: 10_000,
  /**
   * Names approved in WhatsApp Manager (ADR-0009, section 5). A new text is a new name with `_v2`,
   * since a template under review cannot be sent.
   */
  templates: {
    /** Utility, named parameters: date, today, overdue, deadlines, footer. */
    dailySummary: 'daily_summary_v1',
    /** Authentication, copy-code button. */
    phoneCode: 'phone_code_v1',
  },
  /** Profile locale to Meta's language code. A locale without one uses the first. */
  templateLanguages: { 'pt-BR': 'pt_BR' },
  /** Characters per parameter of the summary. Sum 840, so the fixed text has up to 180 of the 1024. */
  summaryBudgets: { date: 40, today: 400, overdue: 160, deadlines: 160, footer: 80 },
  /**
   * The whole message, trimmed, lowercased and without accents and punctuation, equal to one of
   * these stops WhatsApp for every account on that number. The quick reply button says "Parar".
   */
  stopWords: ['parar', 'pare', 'stop', 'sair', 'cancelar', 'descadastrar'],
  /** Meta batches up to 1000 updates in one POST. */
  webhookMaxBytes: 1_048_576,
} as const;
