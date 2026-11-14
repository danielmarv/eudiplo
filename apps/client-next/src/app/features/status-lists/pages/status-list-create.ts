import {
  ChangeDetectionStrategy,
  Component,
  computed,
  type ElementRef,
  inject,
  Injector,
  viewChild,
} from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import type { CreateStatusListDto, StatusListResponseDto } from '@eudiplo/sdk-core';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import { HlmFieldImports } from '@spartan-ng/helm/field';
import { HlmInputImports } from '@spartan-ng/helm/input';
import { HlmNativeSelectImports } from '@spartan-ng/helm/native-select';
import { HlmSpinnerImports } from '@spartan-ng/helm/spinner';
import { injectMutation, injectQuery, QueryClient } from '@tanstack/angular-query-experimental';
import { CallerService } from '../../../core/auth/caller.service';
import { SessionService } from '../../../core/auth/session.service';
import { getApiErrorMessage } from '../../../core/errors/error-message';
import { NotifyService } from '../../../core/notify/notify.service';
import { showFieldsToFix } from '../../../shared/forms/field-to-fix';
import { wholeNumber } from '../../../shared/forms/setting-controls';
import { PageHeader } from '../../../shared/pages/page-header';
import { StatusListBindingFields } from '../components/binding-fields';
import { BIT_LABELS, count } from '../data/status-list-display';
import {
  createStatusListMutation,
  statusListConfigQuery,
  statusListKey,
  statusListsKey,
} from '../data/status-list-queries';

/** The backend's limits for the capacity of a list created through the API. */
const MIN_CAPACITY = 1_000;
const MAX_CAPACITY = 1_000_000;

const CAPACITY_PRESETS = [10_000, 100_000, 500_000, 1_000_000];

/**
 * Creates a status list: what it serves, which key chain signs it, and its size. Left empty, the
 * size follows the tenant's status list settings, else the instance's; the page says which.
 */
@Component({
  selector: 'app-status-list-create',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    RouterLink,
    HlmButtonImports,
    HlmFieldImports,
    HlmInputImports,
    HlmNativeSelectImports,
    HlmSpinnerImports,
    PageHeader,
    StatusListBindingFields,
  ],
  templateUrl: './status-list-create.html',
})
export class StatusListCreate {
  private readonly instance = inject(SessionService).getBaseUrl();
  private readonly caller = inject(CallerService).loadedCaller;
  private readonly tenant = computed(() => this.caller()?.tenantId);
  private readonly router = inject(Router);
  private readonly queryClient = inject(QueryClient);
  private readonly notify = inject(NotifyService);
  private readonly injector = inject(Injector);
  private readonly formElement = viewChild<ElementRef<HTMLFormElement>>('formElement');

  protected readonly form = new FormGroup({
    binding: new FormGroup({
      credentialConfigurationId: new FormControl('', { nonNullable: true }),
      keyChainId: new FormControl('', { nonNullable: true }),
    }),
    bits: new FormControl<'' | '1' | '2' | '4' | '8'>('', { nonNullable: true }),
    capacity: new FormControl<number | null>(null, [
      Validators.min(MIN_CAPACITY),
      Validators.max(MAX_CAPACITY),
      wholeNumber,
    ]),
  });

  /** The tenant's own settings, to say what an empty field falls back to. */
  private readonly settings = injectQuery(() =>
    statusListConfigQuery(this.instance, this.tenant())
  );
  protected readonly defaultBits = computed(() => {
    const bits = this.settings.data()?.bits;
    if (bits) return `Tenant default: ${BIT_LABELS[bits]}`;
    return this.settings.isSuccess() ? 'Instance default (STATUS_BITS)' : 'Default';
  });
  protected readonly defaultCapacity = computed(() => {
    const capacity = this.settings.data()?.capacity;
    if (capacity) return `Tenant default: ${count(capacity)}`;
    return this.settings.isSuccess() ? 'Instance default (STATUS_CAPACITY)' : 'Default';
  });

  private readonly creation = injectMutation(() => createStatusListMutation());
  protected readonly saving = this.creation.isPending;

  protected readonly bitOptions = Object.entries(BIT_LABELS).map(([value, label]) => ({
    value,
    label,
  }));
  protected readonly presets = CAPACITY_PRESETS.map((value) => ({
    value,
    label: new Intl.NumberFormat('en', { notation: 'compact' }).format(value),
  }));
  protected readonly limits = `${count(MIN_CAPACITY)} to ${count(MAX_CAPACITY)}`;

  protected setCapacity(value: number): void {
    this.form.controls.capacity.setValue(value);
    this.form.controls.capacity.markAsDirty();
  }

  protected submit(): void {
    if (this.saving()) return;
    if (this.form.invalid) {
      showFieldsToFix(this.form, {
        notify: this.notify,
        injector: this.injector,
        container: () => this.formElement()?.nativeElement,
        sections: [{ name: 'Size', controls: [this.form.controls.capacity] }],
      });
      return;
    }
    const value = this.form.getRawValue();
    const body: CreateStatusListDto = {
      ...(value.binding.credentialConfigurationId
        ? { credentialConfigurationId: value.binding.credentialConfigurationId }
        : {}),
      ...(value.binding.keyChainId ? { keyChainId: value.binding.keyChainId } : {}),
      ...(value.bits ? { bits: Number(value.bits) as CreateStatusListDto['bits'] } : {}),
      ...(value.capacity ? { capacity: value.capacity } : {}),
    };
    this.creation.mutate(body, {
      onSuccess: (list: StatusListResponseDto) => {
        this.queryClient.setQueryData(statusListKey(this.instance, this.tenant(), list.id), list);
        void this.queryClient.invalidateQueries({
          queryKey: statusListsKey(this.instance, this.tenant()),
          exact: true,
        });
        this.notify.success('Status list created.');
        void this.router.navigate(['/status-lists', list.id]);
      },
      onError: (error) =>
        this.notify.error(getApiErrorMessage(error, 'Failed to create the status list')),
    });
  }
}
