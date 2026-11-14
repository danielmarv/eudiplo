import type { TenantResponseDto } from '@eudiplo/sdk-core';
import { duration } from '../../../shared/format/duration';

/**
 * One setting of a tenant as its page shows it. `value` is undefined where the tenant sets
 * nothing; then `fallback` says what decides instead, such as the environment variable of the
 * instance that sets the default.
 */
export interface Setting {
  readonly label: string;
  readonly value?: string;
  readonly fallback: string;
  /** Whether the fallback is an environment variable, shown as code. */
  readonly fallbackIsVariable?: boolean;
}

const BITS: Record<number, string> = {
  1: '1 bit: valid or revoked',
  2: '2 bits: valid, revoked or suspended',
  4: '4 bits: extended statuses',
  8: '8 bits: extended statuses',
};

function fromInstance(label: string, value: string | undefined, variable: string): Setting {
  return { label, value, fallback: variable, fallbackIsVariable: true };
}

function flag(on: boolean | undefined, yes: string, no: string): string | undefined {
  return on === undefined ? undefined : on ? yes : no;
}

/** How long the tenant keeps the data of an issuance or presentation, and what happens then. */
export function sessionSettings(tenant: TenantResponseDto): Setting[] {
  const config = tenant.sessionConfig;
  const cleanup = config?.cleanupMode;
  return [
    fromInstance(
      'Kept for',
      config?.ttlSeconds ? duration(config.ttlSeconds) : undefined,
      'SESSION_TTL'
    ),
    fromInstance(
      'Then',
      cleanup === 'anonymize'
        ? 'Personal data removed, metadata kept'
        : cleanup === 'full'
          ? 'Deleted completely'
          : undefined,
      'SESSION_CLEANUP_MODE'
    ),
  ];
}

/** How the tenant publishes the revocation status of the credentials it issues. */
export function statusListSettings(tenant: TenantResponseDto): Setting[] {
  const config = tenant.statusListConfig;
  return [
    fromInstance(
      'Entries per list',
      config?.capacity === undefined ? undefined : config.capacity.toLocaleString('en'),
      'STATUS_CAPACITY'
    ),
    fromInstance(
      'Status size',
      config?.bits === undefined ? undefined : BITS[config.bits],
      'STATUS_BITS'
    ),
    fromInstance('Valid for', config?.ttl ? duration(config.ttl) : undefined, 'STATUS_TTL'),
    fromInstance(
      'Republished',
      flag(config?.immediateUpdate, 'On every change', 'When it expires'),
      'STATUS_IMMEDIATE_UPDATE'
    ),
    fromInstance(
      'Aggregation link',
      flag(config?.enableAggregation, 'Included', 'Not included'),
      'STATUS_ENABLE_AGGREGATION'
    ),
  ];
}

/** Which key chains sign for the tenant where a configuration names none. */
export function keyChainSettings(tenant: TenantResponseDto): Setting[] {
  const chains = tenant.defaultKeyChains;
  return [
    {
      label: 'Access',
      value: chains?.access,
      fallback: 'Picked by rule',
    },
    {
      label: 'Authorization server',
      value: chains?.authorizationServer,
      fallback: 'The oldest of its kind',
    },
  ];
}

/** How many of the tenant's settings it sets itself, of all it could. */
export function ownSettings(settings: readonly Setting[]): number {
  return settings.filter((setting) => setting.value !== undefined).length;
}
