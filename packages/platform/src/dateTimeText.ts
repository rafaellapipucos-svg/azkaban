// Pure helpers for the native picker: strings in, strings out, all on the device's local clock.
// No timezone math anywhere: `yyyy-MM-dd` and `HH:mm` are only split and re-joined.

const pad = (n: number) => String(n).padStart(2, '0');

/** `yyyy-MM-dd` -> local Date at midnight. Anything else -> `fallback`. */
export function parseDate(value: string, fallback = new Date()): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return fallback;
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

export function formatDate(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** `HH:mm` -> local Date. Only the time of day matters; the day is a fixed, DST-free January 1st. */
export function parseTime(value: string, fallback = new Date()): Date {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value);
  if (!match) return fallback;
  return new Date(2000, 0, 1, Number(match[1]), Number(match[2]));
}

export function formatTime(date: Date): string {
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
