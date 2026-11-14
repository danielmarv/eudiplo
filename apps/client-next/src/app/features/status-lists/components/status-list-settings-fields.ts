import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { type FormGroup, ReactiveFormsModule } from '@angular/forms';
import { HlmFieldImports } from '@spartan-ng/helm/field';
import { HlmInputImports } from '@spartan-ng/helm/input';
import { HlmNativeSelectImports } from '@spartan-ng/helm/native-select';

/**
 * The fields of a tenant's status list settings (see `statusListSettingsControls`). Each starts at
 * the instance's default, and its description names the environment variable that sets it.
 */
@Component({
  selector: 'app-status-list-settings-fields',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, HlmFieldImports, HlmInputImports, HlmNativeSelectImports],
  host: { class: '@container block' },
  template: `
    <div class="grid gap-x-6 gap-y-5 @xl:grid-cols-2" [formGroup]="form()">
      <hlm-field class="content-start gap-2">
        <label hlmFieldLabel for="setting-capacity">Entries per list</label>
        <input
          hlmInput
          id="setting-capacity"
          class="h-10"
          type="number"
          min="100"
          step="1"
          inputmode="numeric"
          formControlName="capacity"
          placeholder="Instance default"
        />
        <p hlmFieldDescription>
          At least 100. Empty: <code class="font-mono text-xs">STATUS_CAPACITY</code>
        </p>
        <hlm-field-error validator="min">Enter at least 100.</hlm-field-error>
        <hlm-field-error validator="wholeNumber">Enter a whole number.</hlm-field-error>
      </hlm-field>

      <div class="grid content-start gap-2">
        <label class="text-sm font-medium" for="setting-bits">Status size</label>
        <hlm-native-select
          class="w-full"
          selectClass="h-10"
          selectId="setting-bits"
          formControlName="bits"
        >
          <option value="">Instance default</option>
          <option value="1">1 bit: valid or revoked</option>
          <option value="2">2 bits: valid, revoked or suspended</option>
          <option value="4">4 bits: extended statuses</option>
          <option value="8">8 bits: extended statuses</option>
        </hlm-native-select>
        <p class="text-muted-foreground text-sm">
          Default: <code class="font-mono text-xs">STATUS_BITS</code>. For lists created afterwards.
        </p>
      </div>

      <div class="grid content-start gap-2" formGroupName="statusTtl">
        <label class="text-sm font-medium" for="setting-status-ttl">Each list is valid for</label>
        <div class="flex items-start gap-2">
          <hlm-field class="min-w-0 flex-1 gap-2">
            <input
              hlmInput
              id="setting-status-ttl"
              class="h-10"
              type="number"
              min="0"
              step="any"
              inputmode="decimal"
              formControlName="amount"
              placeholder="Instance default"
              aria-describedby="setting-status-ttl-hint"
            />
            <hlm-field-error validator="tooShort">Enter at least one minute.</hlm-field-error>
          </hlm-field>
          <label class="sr-only" for="setting-status-ttl-unit">Unit</label>
          <hlm-native-select
            class="w-28 shrink-0"
            selectClass="h-10"
            selectId="setting-status-ttl-unit"
            formControlName="unit"
          >
            <option value="minutes">minutes</option>
            <option value="hours">hours</option>
            <option value="days">days</option>
          </hlm-native-select>
        </div>
        <p id="setting-status-ttl-hint" class="text-muted-foreground text-sm">
          Empty: <code class="font-mono text-xs">STATUS_TTL</code>
        </p>
      </div>

      <div class="grid content-start gap-2">
        <label class="text-sm font-medium" for="setting-republish">Republish a list</label>
        <hlm-native-select
          class="w-full"
          selectClass="h-10"
          selectId="setting-republish"
          formControlName="immediateUpdate"
        >
          <option value="">Instance default</option>
          <option value="yes">On every change</option>
          <option value="no">When it expires</option>
        </hlm-native-select>
        <p class="text-muted-foreground text-sm">
          Default: <code class="font-mono text-xs">STATUS_IMMEDIATE_UPDATE</code>
        </p>
      </div>

      <div class="grid content-start gap-2">
        <label class="text-sm font-medium" for="setting-aggregation">Aggregation link</label>
        <hlm-native-select
          class="w-full"
          selectClass="h-10"
          selectId="setting-aggregation"
          formControlName="aggregation"
        >
          <option value="">Instance default</option>
          <option value="yes">Include it</option>
          <option value="no">Leave it out</option>
        </hlm-native-select>
        <p class="text-muted-foreground text-sm">
          Lets relying parties fetch every list at once. Default:
          <code class="font-mono text-xs">STATUS_ENABLE_AGGREGATION</code>
        </p>
      </div>
    </div>
  `,
})
export class StatusListSettingsFields {
  /** A group with the controls of `statusListSettingsControls`. */
  readonly form = input.required<FormGroup>();
}
