import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  Injector,
  input,
  untracked,
  viewChild,
} from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideArrowLeft, lucideSave, lucideTriangleAlert } from '@ng-icons/lucide';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import { HlmFieldImports } from '@spartan-ng/helm/field';
import { HlmInputImports } from '@spartan-ng/helm/input';
import { HlmSkeletonImports } from '@spartan-ng/helm/skeleton';
import { HlmSpinnerImports } from '@spartan-ng/helm/spinner';
import { HlmTooltipImports } from '@spartan-ng/helm/tooltip';
import { injectMutation, injectQuery, QueryClient } from '@tanstack/angular-query-experimental';
import { CallerService } from '../../../core/auth/caller.service';
import { SessionService } from '../../../core/auth/session.service';
import { getApiErrorMessage } from '../../../core/errors/error-message';
import { NotifyService } from '../../../core/notify/notify.service';
import {
  configOwnershipQuery,
  fileManaged,
  lockReason,
} from '../../../shared/config-ownership/config-ownership';
import { OwnershipNotice } from '../../../shared/config-ownership/ownership-notice';
import { showFieldsToFix } from '../../../shared/forms/field-to-fix';
import { PageHeader } from '../../../shared/pages/page-header';
import { keyChainQuery, keyChainKey, updateKeyChainMutation } from '../data/key-queries';
import { usageLabel } from '../data/key-display';

/** Description and rotation-policy editor for an existing key chain. */
@Component({
  selector: 'app-key-edit',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    RouterLink,
    NgIcon,
    HlmButtonImports,
    HlmFieldImports,
    HlmInputImports,
    HlmSkeletonImports,
    HlmSpinnerImports,
    HlmTooltipImports,
    OwnershipNotice,
    PageHeader,
  ],
  providers: [provideIcons({ lucideArrowLeft, lucideSave, lucideTriangleAlert })],
  templateUrl: './key-edit.html',
})
export class KeyEdit {
  readonly keyId = input.required<string>();

  private readonly instance = inject(SessionService).getBaseUrl();
  private readonly caller = inject(CallerService).loadedCaller;
  private readonly tenant = computed(() => this.caller()?.tenantId);
  private readonly router = inject(Router);
  private readonly queryClient = inject(QueryClient);
  private readonly notify = inject(NotifyService);
  private readonly injector = inject(Injector);
  private readonly formElement = viewChild<ElementRef<HTMLFormElement>>('formElement');

  protected readonly key = injectQuery(() =>
    keyChainQuery(this.instance, this.tenant(), this.keyId())
  );
  private readonly ownership = injectQuery(() =>
    configOwnershipQuery(this.instance, this.tenant(), 'KeyChain')
  );
  protected readonly ownershipResource = computed(() =>
    this.ownership.data()?.find((resource) => resource.resourceId === this.keyId())
  );
  protected readonly lock = computed(() => {
    const resource = fileManaged(this.ownership.data()).get(this.keyId());
    return resource ? lockReason(resource) : '';
  });
  protected readonly form = new FormGroup({
    description: new FormControl('', { nonNullable: true }),
    rotationEnabled: new FormControl(false, { nonNullable: true }),
    rotationIntervalDays: new FormControl<number | null>(null, [
      Validators.required,
      Validators.min(1),
      Validators.max(3650),
      Validators.pattern(/^\d+$/),
    ]),
    certValidityDays: new FormControl<number | null>(null, [
      Validators.required,
      Validators.min(1),
      Validators.max(3650),
      Validators.pattern(/^\d+$/),
    ]),
  });
  private readonly update = injectMutation(() => updateKeyChainMutation());
  protected readonly saving = this.update.isPending;

  constructor() {
    effect(() => {
      const key = this.key.data();
      if (!key) return;
      untracked(() => {
        if (this.form.dirty) return;
        this.form.reset({
          description: key.description ?? '',
          rotationEnabled: key.rotationPolicy.enabled,
          rotationIntervalDays: key.rotationPolicy.intervalDays ?? 30,
          certValidityDays: key.rotationPolicy.certValidityDays ?? 365,
        });
        this.setRotationControls(key.type === 'internalChain');
      });
    });
    this.form.controls.rotationEnabled.valueChanges.subscribe((enabled) => {
      if (enabled && this.internalChain) this.form.controls.rotationIntervalDays.enable();
      else this.form.controls.rotationIntervalDays.disable();
    });
  }

  protected get internalChain(): boolean {
    return this.key.data()?.type === 'internalChain';
  }

  protected errorMessage(error: unknown): string {
    return getApiErrorMessage(error, 'Failed to load the key chain');
  }

  protected save(): void {
    const key = this.key.data();
    if (!key || this.saving()) return;
    if (this.lock()) {
      this.notify.error(this.lock());
      return;
    }
    if (this.form.invalid) {
      showFieldsToFix(this.form, {
        notify: this.notify,
        injector: this.injector,
        container: () => this.formElement()?.nativeElement,
        sections: this.internalChain
          ? [
              {
                name: 'Rotation policy',
                controls: [
                  this.form.controls.rotationIntervalDays,
                  this.form.controls.certValidityDays,
                ],
              },
            ]
          : [],
      });
      return;
    }
    const value = this.form.getRawValue();
    this.update.mutate(
      {
        id: key.id,
        body: {
          description: value.description.trim() || undefined,
          ...(this.internalChain
            ? {
                rotationPolicy: {
                  enabled: value.rotationEnabled,
                  intervalDays: value.rotationEnabled
                    ? (value.rotationIntervalDays ?? undefined)
                    : undefined,
                  certValidityDays: value.certValidityDays ?? undefined,
                },
              }
            : {}),
        },
      },
      {
        onSuccess: () => {
          this.form.markAsPristine();
          void this.queryClient.invalidateQueries({
            queryKey: keyChainKey(this.instance, this.tenant(), key.id),
            exact: true,
          });
          void this.queryClient.invalidateQueries({
            queryKey: ['key-chains', this.instance, this.tenant()],
            exact: true,
          });
          this.notify.success('Key chain updated.');
          void this.router.navigate(['/keys', key.id]);
        },
        onError: (error) =>
          this.notify.error(getApiErrorMessage(error, 'Failed to update the key chain')),
      }
    );
  }

  protected discard(): void {
    const key = this.key.data();
    if (!key) return;
    this.form.reset({
      description: key.description ?? '',
      rotationEnabled: key.rotationPolicy.enabled,
      rotationIntervalDays: key.rotationPolicy.intervalDays ?? 30,
      certValidityDays: key.rotationPolicy.certValidityDays ?? 365,
    });
  }

  protected readonly usageLabel = usageLabel;

  private setRotationControls(enabled: boolean): void {
    if (!enabled) {
      this.form.controls.rotationEnabled.disable({ emitEvent: false });
      this.form.controls.rotationIntervalDays.disable({ emitEvent: false });
      this.form.controls.certValidityDays.disable({ emitEvent: false });
      return;
    }
    this.form.controls.rotationEnabled.enable({ emitEvent: false });
    this.form.controls.certValidityDays.enable({ emitEvent: false });
    if (this.form.controls.rotationEnabled.value) {
      this.form.controls.rotationIntervalDays.enable({ emitEvent: false });
    } else {
      this.form.controls.rotationIntervalDays.disable({ emitEvent: false });
    }
  }
}
