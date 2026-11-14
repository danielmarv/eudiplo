import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { type FormControl, type FormGroup, ReactiveFormsModule } from '@angular/forms';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideInfo, lucideRefreshCw } from '@ng-icons/lucide';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import { HlmNativeSelectImports } from '@spartan-ng/helm/native-select';
import { injectQuery } from '@tanstack/angular-query-experimental';
import { CallerService } from '../../../core/auth/caller.service';
import { SessionService } from '../../../core/auth/session.service';
import { displayName } from '../../credential-configs/data/credential-config-display';
import { credentialConfigsQuery } from '../../issuance/data/issuance-queries';
import { signingKeyChainsQuery } from '../data/status-list-queries';

/** What a status list is bound to; the empty string leaves it open, or to the tenant's default. */
export type BindingForm = FormGroup<{
  credentialConfigurationId: FormControl<string>;
  keyChainId: FormControl<string>;
}>;

const USAGE: Record<string, string> = { statusList: 'status lists', attestation: 'attestations' };

/**
 * The credential type a status list serves and the key chain that signs it. The options load on
 * their own, so one that fails leaves the other usable and says so, with a retry. A binding
 * whose target no longer exists stays selectable, so saving does not drop it unasked.
 */
@Component({
  selector: 'app-status-list-binding-fields',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, NgIcon, HlmButtonImports, HlmNativeSelectImports],
  providers: [provideIcons({ lucideInfo, lucideRefreshCw })],
  host: { class: '@container block' },
  template: `
    <div class="grid gap-x-6 gap-y-6 @2xl:grid-cols-2" [formGroup]="form()">
      <div class="grid content-start gap-2">
        <label class="text-sm font-medium" for="binding-credential">Credential type</label>
        <hlm-native-select
          class="w-full"
          selectClass="h-10"
          selectId="binding-credential"
          formControlName="credentialConfigurationId"
          aria-describedby="binding-credential-hint"
        >
          <option value="" [selected]="!credential()">Shared by every credential type</option>
          @for (option of credentialOptions(); track option.id) {
            <option [value]="option.id" [selected]="option.id === credential()">
              {{ option.label }}
            </option>
          }
        </hlm-native-select>
        @if (configs.isError()) {
          <div id="binding-credential-hint" class="flex flex-wrap items-center gap-2 text-sm">
            <span class="text-destructive">The credential types could not be loaded.</span>
            <button
              hlmBtn
              variant="link"
              size="sm"
              type="button"
              class="h-auto p-0"
              (click)="configs.refetch()"
            >
              <ng-icon name="lucideRefreshCw" aria-hidden="true" />
              Retry
            </button>
          </div>
        } @else {
          <p id="binding-credential-hint" class="text-muted-foreground text-sm">
            @if (configs.isPending()) {
              Loading the credential types…
            } @else {
              Only credentials of this type get an entry in the list.
            }
          </p>
        }
      </div>

      <div class="grid content-start gap-2">
        <label class="text-sm font-medium" for="binding-key-chain">Signed with</label>
        <hlm-native-select
          class="w-full"
          selectClass="h-10"
          selectId="binding-key-chain"
          formControlName="keyChainId"
          aria-describedby="binding-key-chain-hint"
        >
          <option value="" [selected]="!keyChain()">The tenant's default key chain</option>
          @for (option of keyChainOptions(); track option.id) {
            <option [value]="option.id" [selected]="option.id === keyChain()">
              {{ option.label }}
            </option>
          }
        </hlm-native-select>
        @if (keyChains.isError()) {
          <div id="binding-key-chain-hint" class="flex flex-wrap items-center gap-2 text-sm">
            <span class="text-destructive">The key chains could not be loaded.</span>
            <button
              hlmBtn
              variant="link"
              size="sm"
              type="button"
              class="h-auto p-0"
              (click)="keyChains.refetch()"
            >
              <ng-icon name="lucideRefreshCw" aria-hidden="true" />
              Retry
            </button>
          </div>
        } @else if (keyChains.isSuccess() && !keyChains.data().length) {
          <p id="binding-key-chain-hint" class="text-muted-foreground flex gap-2 text-sm">
            <ng-icon name="lucideInfo" class="mt-0.5 shrink-0" aria-hidden="true" />
            <span>
              No key chain is made for status lists or attestations, so the tenant's default signs
              the list.
            </span>
          </p>
        } @else {
          <p id="binding-key-chain-hint" class="text-muted-foreground text-sm">
            A key chain for status lists, or one for attestations.
          </p>
        }
      </div>
    </div>
  `,
})
export class StatusListBindingFields {
  readonly form = input.required<BindingForm>();

  private readonly instance = inject(SessionService).getBaseUrl();
  private readonly caller = inject(CallerService).loadedCaller;
  private readonly tenant = computed(() => this.caller()?.tenantId);

  protected readonly configs = injectQuery(() =>
    credentialConfigsQuery(this.instance, this.tenant())
  );
  protected readonly keyChains = injectQuery(() =>
    signingKeyChainsQuery(this.instance, this.tenant())
  );

  /** The form's value, followed as it changes. */
  private readonly value = signal({ credentialConfigurationId: '', keyChainId: '' });
  protected readonly credential = computed(() => this.value().credentialConfigurationId);
  protected readonly keyChain = computed(() => this.value().keyChainId);

  constructor() {
    effect((onCleanup) => {
      const form = this.form();
      this.value.set(form.getRawValue());
      const changes = form.valueChanges.subscribe(() => this.value.set(form.getRawValue()));
      onCleanup(() => changes.unsubscribe());
    });
  }

  protected readonly credentialOptions = computed(() => {
    const options = (this.configs.data() ?? []).map((config) => ({
      id: config.id,
      label:
        displayName(config) === config.id ? config.id : `${displayName(config)} (${config.id})`,
    }));
    return withCurrent(options, this.credential(), this.configs.isSuccess());
  });

  protected readonly keyChainOptions = computed(() => {
    const options = (this.keyChains.data() ?? []).map((chain) => ({
      id: chain.id,
      label: `${chain.description || chain.id} (for ${USAGE[chain.usageType] ?? chain.usageType})`,
    }));
    return withCurrent(options, this.keyChain(), this.keyChains.isSuccess());
  });
}

/**
 * The options, plus the current value when it is none of them, so the select can show it; once
 * the options are loaded, such a value names something that no longer exists.
 */
function withCurrent(
  options: { id: string; label: string }[],
  current: string,
  loaded: boolean
): { id: string; label: string }[] {
  return !current || options.some((option) => option.id === current)
    ? options
    : [...options, { id: current, label: loaded ? `${current} (not found)` : current }];
}
