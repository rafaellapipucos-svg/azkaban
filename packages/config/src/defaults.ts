export const defaults = {
  locale: 'pt-BR',
  timezone: 'America/Sao_Paulo',
  inviteTtlDays: 7,
  contextColorToken: 'violet',
  contextIcon: '📍',
  /** `useCurrentUser` keeps `['profile']` and `['groups']` fresh this long; own changes invalidate (ADR-0012, section 10, QA8-3). */
  currentUserStaleMs: 60_000,
} as const;
