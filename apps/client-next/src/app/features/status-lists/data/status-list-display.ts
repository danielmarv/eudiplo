import type { StatusListConfig, StatusListResponseDto } from '@eudiplo/sdk-core';
import { duration } from '../../../shared/format/duration';

const compact = new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 });
const whole = new Intl.NumberFormat('en');

/** A count in few characters: "950", "10K", "1.5M". */
export function compactCount(count: number): string {
  return compact.format(count);
}

/** A count with separators: "10,000". */
export function count(value: number): string {
  return whole.format(value);
}

/** The share of the list's entries that credentials use, from 0 to 100. */
export function usagePercent(
  list: Pick<StatusListResponseDto, 'usedEntries' | 'capacity'>
): number {
  return list.capacity > 0 ? Math.min(100, (list.usedEntries / list.capacity) * 100) : 0;
}

/** How full a list is: nearly full from 70%, full from 90%. */
export type UsageLevel = 'ok' | 'filling' | 'full';

export function usageLevel(percent: number): UsageLevel {
  return percent >= 90 ? 'full' : percent >= 70 ? 'filling' : 'ok';
}

/**
 * Whether the signed list that relying parties fetch is current: not signed yet, valid, expiring
 * within the hour, or expired, which the backend renews on the next request.
 */
export type TokenState = 'none' | 'valid' | 'expiring' | 'expired';

export function tokenState(
  list: Pick<StatusListResponseDto, 'expiresAt'>,
  now = Date.now()
): TokenState {
  if (!list.expiresAt) return 'none';
  const left = new Date(list.expiresAt).getTime() - now;
  if (Number.isNaN(left)) return 'none';
  if (left < 0) return 'expired';
  return left < 3_600_000 ? 'expiring' : 'valid';
}

export const TOKEN_STATES: Record<
  TokenState,
  { label: string; detail: string; tone: string; icon: string }
> = {
  none: {
    label: 'Not signed yet',
    detail: 'Signed when it is first requested.',
    tone: 'bg-muted text-muted-foreground',
    icon: 'lucideCircleDashed',
  },
  valid: {
    label: 'Valid',
    detail: 'Relying parties get the current list.',
    tone: 'bg-success/12 text-success',
    icon: 'lucideCircleCheck',
  },
  expiring: {
    label: 'Expires soon',
    detail: 'Expires within the hour, then it is signed again on the next request.',
    tone: 'bg-warning/12 text-warning',
    icon: 'lucideClock',
  },
  expired: {
    label: 'Expired',
    detail: 'Signed again on the next request.',
    tone: 'bg-muted text-foreground',
    icon: 'lucideRefreshCw',
  },
};

/** How many statuses an entry can hold with this many bits. */
export const BIT_LABELS: Record<number, string> = {
  1: '1 bit: valid or revoked',
  2: '2 bits: valid, revoked or suspended',
  4: '4 bits: extended statuses',
  8: '8 bits: extended statuses',
};

const ENVIRONMENT: Record<keyof StatusListConfig, string> = {
  capacity: 'STATUS_CAPACITY',
  bits: 'STATUS_BITS',
  ttl: 'STATUS_TTL',
  immediateUpdate: 'STATUS_IMMEDIATE_UPDATE',
  enableAggregation: 'STATUS_ENABLE_AGGREGATION',
};

/** Fixed when a list is created; the others apply to every list the next time it is signed. */
const NEW_LISTS_ONLY: ReadonlySet<keyof StatusListConfig> = new Set(['capacity', 'bits']);

const list = new Intl.ListFormat('en', { type: 'conjunction' });

/** The settings the tenant stores, which a reset removes. */
export function storedSettings(config: StatusListConfig | undefined): (keyof StatusListConfig)[] {
  return (Object.keys(ENVIRONMENT) as (keyof StatusListConfig)[]).filter(
    (setting) => config?.[setting] !== undefined && config?.[setting] !== null
  );
}

/**
 * What a reset changes: the settings it removes, and which lists then follow which environment
 * variables of the instance. Empty when the tenant stores nothing.
 */
export function resetConsequences(config: StatusListConfig | undefined): string {
  const stored = storedSettings(config);
  if (!stored.length || !config) return '';
  const describe = (setting: keyof StatusListConfig): string => {
    switch (setting) {
      case 'capacity':
        return `${count(config.capacity!)} entries per list`;
      case 'bits':
        return `${config.bits} ${config.bits === 1 ? 'bit' : 'bits'} per status`;
      case 'ttl':
        return `a validity of ${duration(config.ttl!)}`;
      case 'immediateUpdate':
        return config.immediateUpdate ? 'republishing on every change' : 'republishing on expiry';
      case 'enableAggregation':
        return config.enableAggregation
          ? 'the aggregation link'
          : 'leaving out the aggregation link';
    }
  };
  const variables = (settings: (keyof StatusListConfig)[]) =>
    list.format(settings.map((setting) => ENVIRONMENT[setting]));
  const forNew = stored.filter((setting) => NEW_LISTS_ONLY.has(setting));
  const forAll = stored.filter((setting) => !NEW_LISTS_ONLY.has(setting));
  const effects = [
    forNew.length ? `new status lists follow ${variables(forNew)}` : '',
    forAll.length ? `all status lists, existing ones too, follow ${variables(forAll)}` : '',
  ].filter(Boolean);
  return `This removes ${list.format(stored.map(describe))}. Afterwards ${effects.join(', and ')} of this instance.`;
}
