import type { SessionStorageConfig, UpdateSessionConfigDto } from '@eudiplo/sdk-core';

export interface SessionSettingsValue {
  ttlSeconds: number | null | '';
  cleanupMode: 'full' | 'anonymize' | '' | null;
}

/** Sends only overrides the user set, and clears a stored TTL when the field is emptied. */
export function sessionSettingsUpdate(
  value: SessionSettingsValue,
  current: SessionStorageConfig | undefined
): UpdateSessionConfigDto {
  const update: UpdateSessionConfigDto = {};
  if (value.ttlSeconds !== null && value.ttlSeconds !== '') {
    update.ttlSeconds = value.ttlSeconds;
  } else if (current?.ttlSeconds != null) {
    update.ttlSeconds = null;
  }
  if (value.cleanupMode) update.cleanupMode = value.cleanupMode;
  return update;
}

export function formatSessionTtl(seconds?: number | null): string {
  if (!seconds) return 'Global default (SESSION_TTL of this instance)';
  const units: [string, number][] = [
    ['day', 86_400],
    ['hour', 3_600],
    ['minute', 60],
    ['second', 1],
  ];
  const parts: string[] = [];
  let rest = seconds;
  for (const [unit, size] of units) {
    const count = Math.floor(rest / size);
    if (count) {
      parts.push(`${count} ${unit}${count === 1 ? '' : 's'}`);
      rest -= count * size;
    }
  }
  return parts.join(' ') || `${seconds} seconds`;
}
