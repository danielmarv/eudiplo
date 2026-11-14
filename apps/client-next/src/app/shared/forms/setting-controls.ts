import {
  type AbstractControl,
  FormControl,
  FormGroup,
  type ValidationErrors,
} from '@angular/forms';

/**
 * Controls of settings that an instance default stands in for while they are empty, as the
 * tenant and status list settings have them.
 */

export type DurationUnit = 'minutes' | 'hours' | 'days';

const DURATION_UNITS: readonly { value: DurationUnit; seconds: number }[] = [
  { value: 'minutes', seconds: 60 },
  { value: 'hours', seconds: 3_600 },
  { value: 'days', seconds: 86_400 },
];

/** A choice that can also leave the decision to the instance (the empty string). */
export type OrDefault<T extends string> = '' | T;

/** Seconds from an amount in a unit, rounded to whole seconds; none without an amount. */
export function toSeconds(amount: number | null, unit: DurationUnit): number | undefined {
  if (amount === null || Number.isNaN(amount)) return undefined;
  const factor = DURATION_UNITS.find((candidate) => candidate.value === unit)!.seconds;
  return Math.round(amount * factor);
}

/** An amount in the largest unit that divides `seconds` exactly, else in minutes. */
export function fromSeconds(seconds: number | undefined): {
  amount: number | null;
  unit: DurationUnit;
} {
  if (!seconds) return { amount: null, unit: 'hours' };
  const unit =
    [...DURATION_UNITS].reverse().find((candidate) => seconds % candidate.seconds === 0) ??
    DURATION_UNITS[0];
  return { amount: seconds / unit.seconds, unit: unit.value };
}

/** The backend's minimum for these durations: one minute. */
function atLeastAMinute(control: AbstractControl): ValidationErrors | null {
  const amount = control.value as number | null;
  if (amount === null) return null;
  const unit = (control.parent?.get('unit')?.value as DurationUnit | undefined) ?? 'minutes';
  return (toSeconds(amount, unit) ?? 0) >= 60 ? null : { tooShort: true };
}

export function wholeNumber(control: AbstractControl): ValidationErrors | null {
  const value = control.value as number | null;
  return value === null || Number.isInteger(value) ? null : { wholeNumber: true };
}

/** An amount and its unit, empty by default; at least one minute when set. */
export function durationGroup() {
  const group = new FormGroup({
    amount: new FormControl<number | null>(null, atLeastAMinute),
    unit: new FormControl<DurationUnit>('hours', { nonNullable: true }),
  });
  // The minimum depends on the unit too.
  group.controls.unit.valueChanges.subscribe(() => group.controls.amount.updateValueAndValidity());
  return group;
}

/** A yes/no choice as the API takes it: undefined while the instance decides. */
export function fromChoice(value: OrDefault<'yes' | 'no'>): boolean | undefined {
  return value === '' ? undefined : value === 'yes';
}

/** A flag of the API as a yes/no choice, empty while the instance decides. */
export function toChoice(on: boolean | null | undefined): OrDefault<'yes' | 'no'> {
  return on === undefined || on === null ? '' : on ? 'yes' : 'no';
}

/** An object without its undefined entries, as the API stores only what is set. */
export function defined<T extends object>(object: T): T {
  return Object.fromEntries(Object.entries(object).filter(([, entry]) => entry !== undefined)) as T;
}
