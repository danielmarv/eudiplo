import { FormControl, Validators } from '@angular/forms';
import type { StatusListConfig } from '@eudiplo/sdk-core';
import {
  defined,
  durationGroup,
  fromChoice,
  fromSeconds,
  type OrDefault,
  toChoice,
  toSeconds,
  wholeNumber,
} from '../../../shared/forms/setting-controls';

type Bits = OrDefault<'1' | '2' | '4' | '8'>;

/**
 * The status list settings of a tenant, each empty to leave it to the instance. The limits are
 * the backend's (`status-list-config.schema.ts`). The tenant form and the status list settings
 * page both hold them.
 */
export function statusListSettingsControls() {
  return {
    capacity: new FormControl<number | null>(null, [Validators.min(100), wholeNumber]),
    bits: new FormControl<Bits>('', { nonNullable: true }),
    statusTtl: durationGroup(),
    immediateUpdate: new FormControl<OrDefault<'yes' | 'no'>>('', { nonNullable: true }),
    aggregation: new FormControl<OrDefault<'yes' | 'no'>>('', { nonNullable: true }),
  };
}

export interface StatusListSettingsValue {
  capacity: number | null;
  bits: Bits;
  statusTtl: ReturnType<typeof fromSeconds>;
  immediateUpdate: OrDefault<'yes' | 'no'>;
  aggregation: OrDefault<'yes' | 'no'>;
}

/** The settings as the API takes them, holding only what the tenant sets itself. */
export function statusListSettingsBody(value: StatusListSettingsValue): StatusListConfig {
  return defined({
    capacity: value.capacity ?? undefined,
    bits: value.bits ? (Number(value.bits) as StatusListConfig['bits']) : undefined,
    ttl: toSeconds(value.statusTtl.amount, value.statusTtl.unit),
    immediateUpdate: fromChoice(value.immediateUpdate),
    enableAggregation: fromChoice(value.aggregation),
  });
}

/** The form's value for what `config` sets, the rest left to the instance. */
export function statusListSettingsValue(
  config: StatusListConfig | null | undefined
): StatusListSettingsValue {
  return {
    capacity: config?.capacity ?? null,
    bits: config?.bits ? (String(config.bits) as Bits) : '',
    statusTtl: fromSeconds(config?.ttl ?? undefined),
    immediateUpdate: toChoice(config?.immediateUpdate),
    aggregation: toChoice(config?.enableAggregation),
  };
}
