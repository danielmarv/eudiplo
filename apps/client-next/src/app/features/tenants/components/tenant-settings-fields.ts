import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';
import { HlmFieldImports } from '@spartan-ng/helm/field';
import { HlmInputImports } from '@spartan-ng/helm/input';
import { HlmNativeSelectImports } from '@spartan-ng/helm/native-select';
import { StatusListSettingsFields } from '../../status-lists/components/status-list-settings-fields';
import type { SettingsForm } from '../data/tenant-settings-form';

/**
 * The fields of the settings a tenant can set for itself. Each starts at the instance's default,
 * and its description names the environment variable that sets that default.
 */
@Component({
  selector: 'app-tenant-settings-fields',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    HlmFieldImports,
    HlmInputImports,
    HlmNativeSelectImports,
    StatusListSettingsFields,
  ],
  host: { class: '@container block' },
  template: `
    <div class="grid gap-8" [formGroup]="form()">
      <fieldset class="grid gap-5">
        <legend class="mb-4 text-sm font-semibold">Session data</legend>
        <div class="grid gap-x-6 gap-y-5 @xl:grid-cols-2">
          <div class="grid content-start gap-2" formGroupName="sessionTtl">
            <label class="text-sm font-medium" for="setting-session-ttl">Keep it for</label>
            <div class="flex items-start gap-2">
              <hlm-field class="min-w-0 flex-1 gap-2">
                <input
                  hlmInput
                  id="setting-session-ttl"
                  class="h-10"
                  type="number"
                  min="0"
                  step="any"
                  inputmode="decimal"
                  formControlName="amount"
                  placeholder="Instance default"
                  aria-describedby="setting-session-ttl-hint"
                />
                <hlm-field-error validator="tooShort">Enter at least one minute.</hlm-field-error>
              </hlm-field>
              <label class="sr-only" for="setting-session-ttl-unit">Unit</label>
              <hlm-native-select
                class="w-28 shrink-0"
                selectClass="h-10"
                selectId="setting-session-ttl-unit"
                formControlName="unit"
              >
                <option value="minutes">minutes</option>
                <option value="hours">hours</option>
                <option value="days">days</option>
              </hlm-native-select>
            </div>
            <p id="setting-session-ttl-hint" class="text-muted-foreground text-sm">
              Empty: <code class="font-mono text-xs">SESSION_TTL</code>
            </p>
          </div>

          <div class="grid content-start gap-2">
            <label class="text-sm font-medium" for="setting-cleanup">Then</label>
            <hlm-native-select
              class="w-full"
              selectClass="h-10"
              selectId="setting-cleanup"
              formControlName="cleanupMode"
            >
              <option value="">Instance default</option>
              <option value="full">Delete it completely</option>
              <option value="anonymize">Remove personal data, keep metadata</option>
            </hlm-native-select>
            <p class="text-muted-foreground text-sm">
              Default: <code class="font-mono text-xs">SESSION_CLEANUP_MODE</code>
            </p>
          </div>
        </div>
      </fieldset>

      <fieldset class="grid gap-5">
        <legend class="mb-4 text-sm font-semibold">Status lists</legend>
        <app-status-list-settings-fields [form]="form()" />
      </fieldset>
    </div>
  `,
})
export class TenantSettingsFields {
  readonly form = input.required<SettingsForm>();
}
