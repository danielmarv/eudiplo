import { describe, expect, it } from 'vitest';
import { relativeTime } from './relative-time';

describe('relativeTime', () => {
  const now = Date.parse('2026-11-13T12:00:00Z');
  const at = (offsetSeconds: number) => new Date(now + offsetSeconds * 1000).toISOString();

  it('says how long ago, in the largest whole unit', () => {
    expect(relativeTime(at(-20), now)).toBe('just now');
    expect(relativeTime(at(-5 * 60), now)).toBe('5 minutes ago');
    expect(relativeTime(at(-3 * 3600), now)).toBe('3 hours ago');
    expect(relativeTime(at(-24 * 3600), now)).toBe('yesterday');
    expect(relativeTime(at(-14 * 24 * 3600), now)).toBe('2 weeks ago');
  });

  it('says how long until a time ahead', () => {
    expect(relativeTime(at(2 * 3600), now)).toBe('in 2 hours');
  });

  it('gives nothing for a time it cannot read', () => {
    expect(relativeTime('not a date', now)).toBe('');
  });
});
