import { describe, expect, it } from 'vitest';
import { fromSeconds, toSeconds } from '../../../shared/forms/setting-controls';
import {
  createSettingsForm,
  fillSettings,
  ownSettingsCount,
  settingsBody,
} from './tenant-settings-form';

describe('tenant settings form', () => {
  it('converts between seconds and an amount in the largest whole unit', () => {
    expect(fromSeconds(86_400)).toEqual({ amount: 1, unit: 'days' });
    expect(fromSeconds(7_200)).toEqual({ amount: 2, unit: 'hours' });
    expect(fromSeconds(90)).toEqual({ amount: 1.5, unit: 'minutes' });
    expect(fromSeconds(undefined)).toEqual({ amount: null, unit: 'hours' });
    expect(toSeconds(1.5, 'hours')).toBe(5_400);
    expect(toSeconds(null, 'days')).toBeUndefined();
  });

  it('sends nothing for the settings left to the instance', () => {
    const form = createSettingsForm();

    expect(settingsBody(form.getRawValue())).toEqual({ sessionConfig: {}, statusListConfig: {} });
    expect(ownSettingsCount(form.getRawValue())).toBe(0);
  });

  it('sends the settings the tenant sets, as the API takes them', () => {
    const form = createSettingsForm();
    form.patchValue({
      sessionTtl: { amount: 2, unit: 'days' },
      cleanupMode: 'anonymize',
      capacity: 5000,
      bits: '2',
      immediateUpdate: 'no',
      aggregation: 'yes',
    });

    expect(settingsBody(form.getRawValue())).toEqual({
      sessionConfig: { ttlSeconds: 172_800, cleanupMode: 'anonymize' },
      statusListConfig: {
        capacity: 5000,
        bits: 2,
        immediateUpdate: false,
        enableAggregation: true,
      },
    });
    expect(ownSettingsCount(form.getRawValue())).toBe(6);
  });

  it('refuses what the backend refuses: under a minute, or under 100 entries', () => {
    const form = createSettingsForm();
    const ttl = form.controls.sessionTtl.controls;

    ttl.amount.setValue(30);
    ttl.unit.setValue('minutes');
    expect(ttl.amount.valid).toBe(true);
    ttl.amount.setValue(0.5);
    expect(ttl.amount.hasError('tooShort')).toBe(true);
    ttl.unit.setValue('hours');
    expect(ttl.amount.valid).toBe(true);

    form.controls.capacity.setValue(99);
    expect(form.controls.capacity.hasError('min')).toBe(true);
    form.controls.capacity.setValue(100.5);
    expect(form.controls.capacity.hasError('wholeNumber')).toBe(true);
  });

  it('fills in what a tenant sets and leaves the rest to the instance', () => {
    const form = createSettingsForm();
    fillSettings(form, {
      id: 'acme',
      name: 'Acme',
      status: 'active',
      sessionConfig: { ttlSeconds: 3_600 },
      statusListConfig: { bits: 4, enableAggregation: false },
    });

    expect(form.getRawValue()).toEqual({
      sessionTtl: { amount: 1, unit: 'hours' },
      cleanupMode: '',
      capacity: null,
      bits: '4',
      statusTtl: { amount: null, unit: 'hours' },
      immediateUpdate: '',
      aggregation: 'no',
    });
  });
});
