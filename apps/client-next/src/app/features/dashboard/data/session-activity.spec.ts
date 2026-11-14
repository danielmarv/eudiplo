import type { SessionTypeStatsDto } from '@eudiplo/sdk-core';
import { describe, expect, it } from 'vitest';
import { bucketsOf, rangeHasHistory, totalsOf } from './session-activity';

const stats = (
  total: number,
  completed: number,
  failureCodes: { code: string; count: number }[] = [],
  lastCompletedAt: string | null = null
): SessionTypeStatsDto => ({
  total,
  byStatus: {
    active: 0,
    fetched: 0,
    completed,
    expired: 0,
    failed: total - completed,
    cancelled: 0,
  },
  failureCodes,
  lastCompletedAt,
});

describe('bucketsOf', () => {
  const now = new Date(2026, 10, 14, 16, 25, 30);

  it('splits a day into the 24 hours up to the current one, each ending before the next', () => {
    const buckets = bucketsOf('24h', now);

    expect(buckets).toHaveLength(24);
    expect(buckets[0].start).toEqual(new Date(2026, 10, 13, 17, 0, 0));
    expect(buckets[0].end.getTime()).toBe(buckets[1].start.getTime() - 1);
    expect(buckets.at(-1)!.start).toEqual(new Date(2026, 10, 14, 16, 0, 0));
    expect(buckets.at(-1)!.end).toBe(now);
  });

  it('splits a week into days from midnight, today last', () => {
    const buckets = bucketsOf('7d', now);

    expect(buckets).toHaveLength(7);
    expect(buckets[0].start).toEqual(new Date(2026, 10, 8));
    expect(buckets.at(-1)!.start).toEqual(new Date(2026, 10, 14));
    expect(bucketsOf('30d', now)).toHaveLength(30);
  });
});

describe('totalsOf', () => {
  it('adds up the buckets of a kind, its failure codes and its last completion', () => {
    const totals = totalsOf(
      [
        {
          start: new Date(),
          end: new Date(),
          issuance: stats(4, 3, [{ code: 'invalid_proof', count: 1 }], '2026-11-14T10:00:00Z'),
        },
        {
          start: new Date(),
          end: new Date(),
          issuance: stats(
            6,
            3,
            [
              { code: 'invalid_proof', count: 1 },
              { code: 'credential_failure', count: 2 },
            ],
            '2026-11-14T12:00:00Z'
          ),
        },
      ],
      'issuance'
    );

    expect(totals).toEqual({
      total: 10,
      byStatus: { active: 0, fetched: 0, completed: 6, expired: 0, failed: 4, cancelled: 0 },
      failureCodes: [
        { code: 'credential_failure', count: 2 },
        { code: 'invalid_proof', count: 2 },
      ],
      lastCompletedAt: '2026-11-14T12:00:00Z',
    });
  });

  it('has nothing for a kind the caller cannot read', () => {
    expect(
      totalsOf([{ start: new Date(), end: new Date(), issuance: stats(1, 1) }], 'presentation')
    ).toBeUndefined();
  });
});

describe('rangeHasHistory', () => {
  it('offers only the periods the backend keeps sessions for', () => {
    const full = { cleanupMode: 'full' as const, ttlSeconds: 86_400 };
    expect(rangeHasHistory('24h', full)).toBe(true);
    expect(rangeHasHistory('7d', full)).toBe(false);
    expect(rangeHasHistory('7d', { ...full, ttlSeconds: 7 * 86_400 })).toBe(true);
    expect(rangeHasHistory('30d', { cleanupMode: 'anonymize', ttlSeconds: 3_600 })).toBe(true);
    expect(rangeHasHistory('30d', undefined)).toBe(true);
  });
});
