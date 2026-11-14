import { describe, expect, it } from 'vitest';
import {
  formatSessionTtl,
  sessionSettingsUpdate,
  type SessionSettingsValue,
} from './session-settings-form';

describe('session settings form', () => {
  it('clears only a stored TTL and leaves an unset cleanup mode unchanged', () => {
    const value: SessionSettingsValue = { ttlSeconds: null, cleanupMode: null };
    expect(sessionSettingsUpdate(value, { ttlSeconds: 3600, cleanupMode: 'full' })).toEqual({
      ttlSeconds: null,
    });
    expect(sessionSettingsUpdate(value, {})).toEqual({});
  });

  it('writes chosen overrides and formats a TTL for the current-settings summary', () => {
    expect(
      sessionSettingsUpdate(
        { ttlSeconds: 90_061, cleanupMode: 'anonymize' },
        { cleanupMode: 'full' }
      )
    ).toEqual({ ttlSeconds: 90_061, cleanupMode: 'anonymize' });
    expect(formatSessionTtl(90_061)).toBe('1 day 1 hour 1 minute 1 second');
    expect(formatSessionTtl()).toContain('SESSION_TTL');
  });
});
