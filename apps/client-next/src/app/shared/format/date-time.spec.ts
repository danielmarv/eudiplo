import { describe, expect, it } from 'vitest';
import { dateTime } from './date-time';

describe('dateTime', () => {
  it('shows an ISO string or milliseconds as a medium date with the time', () => {
    const local = new Date(2026, 0, 5, 13, 0);
    expect(dateTime(local.toISOString())).toBe('Jan 5, 2026, 1:00 PM');
    expect(dateTime(local.getTime())).toBe('Jan 5, 2026, 1:00 PM');
  });

  it('is empty for a value that is not a time', () => {
    expect(dateTime('not a date')).toBe('');
  });
});
