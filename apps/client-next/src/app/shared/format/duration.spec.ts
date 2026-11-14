import { describe, expect, it } from 'vitest';
import { duration, timeLeft } from './duration';

describe('duration', () => {
  it('names the largest unit that divides the seconds exactly', () => {
    expect(duration(86_400)).toBe('1 day');
    expect(duration(172_800)).toBe('2 days');
    expect(duration(129_600)).toBe('36 hours');
    expect(duration(3_600)).toBe('1 hour');
    expect(duration(300)).toBe('5 minutes');
    expect(duration(90)).toBe('90 seconds');
    expect(duration(1)).toBe('1 second');
  });
});

describe('timeLeft', () => {
  it('says the time left in hours and minutes, or minutes and seconds', () => {
    expect(timeLeft(86_397_000)).toBe('23 h 59 min');
    expect(timeLeft(3_845_000)).toBe('1 h 04 min');
    expect(timeLeft(65_000)).toBe('1 min 05 s');
    expect(timeLeft(9_999)).toBe('9 s');
    expect(timeLeft(-1)).toBe('0 s');
  });
});
