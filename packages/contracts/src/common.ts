import { z } from 'zod';

// z.guid accepts hand-written ids from fixtures, which z.uuid rejects by version.
export const idSchema = z.guid();

// Postgres returns "+00:00", not "Z", so an offset has to be valid.
export const instantSchema = z.iso.datetime({ offset: true });
export const localDateSchema = z.iso.date();

export const nameSchema = z.string().trim().min(1).max(80);

const isTimezone = (value: string) => {
  try {
    new Intl.DateTimeFormat('en', { timeZone: value });
    return true;
  } catch {
    return false;
  }
};

export const timezoneSchema = z.string().refine(isTimezone);

/**
 * Message of the error raised by any RPC, trigger or function behind `consume_rate_limit`
 * (ADR-0012, section 4): SQLSTATE `PT429`, which PostgREST answers with HTTP 429, and the seconds
 * until the window ends in `hint`. Every module maps it to its own `errors.rate_limited` text.
 */
export const rateLimitedErrorCode = 'rate_limited';
