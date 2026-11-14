import { describe, expect, it } from 'vitest';
import {
  compactCount,
  resetConsequences,
  storedSettings,
  tokenState,
  usageLevel,
  usagePercent,
} from './status-list-display';

describe('status list display', () => {
  it('says how full a list is, amber from 70% and red from 90%', () => {
    expect(usagePercent({ usedEntries: 250, capacity: 1_000 })).toBe(25);
    expect(usagePercent({ usedEntries: 5, capacity: 0 })).toBe(0);
    expect(usageLevel(69.9)).toBe('ok');
    expect(usageLevel(70)).toBe('filling');
    expect(usageLevel(90)).toBe('full');
    expect(compactCount(10_000)).toBe('10K');
    expect(compactCount(1_500_000)).toBe('1.5M');
  });

  it('says whether the signed copy is current, expiring within the hour, or expired', () => {
    const now = Date.parse('2026-11-14T12:00:00Z');
    expect(tokenState({ expiresAt: null }, now)).toBe('none');
    expect(tokenState({ expiresAt: '2026-11-14T15:00:00Z' }, now)).toBe('valid');
    expect(tokenState({ expiresAt: '2026-11-14T12:30:00Z' }, now)).toBe('expiring');
    expect(tokenState({ expiresAt: '2026-11-14T11:59:00Z' }, now)).toBe('expired');
  });

  it('says what a reset removes and which variables apply afterwards', () => {
    expect(storedSettings({})).toEqual([]);
    expect(resetConsequences({})).toBe('');
    expect(storedSettings({ capacity: 5_000, ttl: 3_600 })).toEqual(['capacity', 'ttl']);
    expect(resetConsequences({ capacity: 5_000, bits: 2, ttl: 3_600 })).toBe(
      'This removes 5,000 entries per list, 2 bits per status, and a validity of 1 hour. ' +
        'Afterwards new status lists follow STATUS_CAPACITY and STATUS_BITS, and all status ' +
        'lists, existing ones too, follow STATUS_TTL of this instance.'
    );
    expect(resetConsequences({ immediateUpdate: false })).toBe(
      'This removes republishing on expiry. Afterwards all status lists, existing ones too, ' +
        'follow STATUS_IMMEDIATE_UPDATE of this instance.'
    );
  });
});
