export const defaults = {
  locale: 'pt-BR',
  timezone: 'America/Sao_Paulo',
  inviteTtlDays: 7,
  contextColorToken: 'violet',
  contextIcon: '📍',
  /** `useCurrentUser` keeps `['profile']` and `['groups']` fresh this long; own changes invalidate (ADR-0012, section 10, QA8-3). */
  currentUserStaleMs: 60_000,
  /**
   * A 503 from `/functions/v1/` is a function that never ran (ADR-0012, section 18): the client waits
   * each of these and sends again, so its length is the number of retries. Any other answer, as is.
   */
  functionRetryDelaysMs: [500, 1500],
  /**
   * Native only (BL23-2): a sign-in link starts a session only this long after this device asked for
   * one. The GoTrue link lives as long, `otp_expiry` in `supabase/config.toml`.
   */
  sessionLinkRequestMaxAgeMs: 3_600_000,
} as const;
