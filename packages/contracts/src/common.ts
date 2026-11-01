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
