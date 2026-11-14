import { FormControl, FormGroup } from '@angular/forms';
import type { SessionStorageConfig, StatusListConfig, TenantResponseDto } from '@eudiplo/sdk-core';
import {
  defined,
  durationGroup,
  fromSeconds,
  type OrDefault,
  toSeconds,
} from '../../../shared/forms/setting-controls';
import {
  statusListSettingsBody,
  statusListSettingsControls,
  statusListSettingsValue,
} from '../../status-lists/data/status-list-settings-form';

/**
 * The settings a tenant can set for itself; every field starts empty, which leaves it to the
 * instance. The limits are the backend's (`session-storage-config.schema.ts`,
 * `status-list-config.schema.ts`).
 */
export function createSettingsForm() {
  return new FormGroup({
    sessionTtl: durationGroup(),
    cleanupMode: new FormControl<OrDefault<'full' | 'anonymize'>>('', { nonNullable: true }),
    ...statusListSettingsControls(),
  });
}

export type SettingsForm = ReturnType<typeof createSettingsForm>;
type SettingsValue = ReturnType<SettingsForm['getRawValue']>;

/** The settings as the API takes them, each object holding only what the tenant sets itself. */
export function settingsBody(value: SettingsValue): {
  sessionConfig: SessionStorageConfig;
  statusListConfig: StatusListConfig;
} {
  return {
    sessionConfig: defined({
      ttlSeconds: toSeconds(value.sessionTtl.amount, value.sessionTtl.unit),
      cleanupMode: value.cleanupMode || undefined,
    }),
    statusListConfig: statusListSettingsBody(value),
  };
}

/** How many settings the form sets, of all it offers. */
export function ownSettingsCount(value: SettingsValue): number {
  const body = settingsBody(value);
  return Object.keys(body.sessionConfig).length + Object.keys(body.statusListConfig).length;
}

/** Fills the form with what `tenant` sets itself, the rest left to the instance. */
export function fillSettings(form: SettingsForm, tenant: TenantResponseDto): void {
  const session = tenant.sessionConfig ?? {};
  form.setValue({
    sessionTtl: fromSeconds(session.ttlSeconds),
    cleanupMode: session.cleanupMode ?? '',
    ...statusListSettingsValue(tenant.statusListConfig),
  });
}
