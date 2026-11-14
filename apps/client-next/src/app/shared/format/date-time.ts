const format = new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short' });

/**
 * A point in time, from an ISO string or milliseconds since 1970, in the browser's time zone:
 * "Jan 5, 2026, 1:00 PM". Empty for a value that is not a time.
 */
export function dateTime(value: string | number): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : format.format(date);
}
