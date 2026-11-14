import {
  ChangeDetectionStrategy,
  Component,
  computed,
  type ElementRef,
  effect,
  inject,
  Injector,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';
import type { RegistrarConfigResponseDto } from '@eudiplo/sdk-core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideCircleCheck,
  lucideCircleDashed,
  lucideEye,
  lucideEyeOff,
  lucideInfo,
  lucideLock,
  lucideTrash2,
  lucideTriangleAlert,
} from '@ng-icons/lucide';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import { HlmFieldImports } from '@spartan-ng/helm/field';
import { HlmInputImports } from '@spartan-ng/helm/input';
import { HlmNativeSelectImports } from '@spartan-ng/helm/native-select';
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
import { ConfirmService } from '../../../shared/dialogs/confirm';
import { type FormSection, showFieldsToFix } from '../../../shared/forms/field-to-fix';
import { PageHeader } from '../../../shared/pages/page-header';
import {
  createRegistrarForm,
  fillRegistrarForm,
  REGISTRAR_PRESETS,
  registrarRequest,
  urlsChanged,
} from '../data/registrar-form';
import {
  createRegistrarConfigMutation,
  deleteRegistrarConfigMutation,
  registrarConfigKey,
  registrarConfigQuery,
  updateRegistrarConfigMutation,
} from '../data/registrar-queries';

/** The registrar configuration is one resource per tenant, with this ID in configuration files. */
const RESOURCE_ID = 'registrar';

/**
 * The registrar EUDIPLO signs in to for access and registration certificates: where it is, the
 * account, the relying party contact it registers, and the defaults of registration certificates.
 * Stored secrets are never shown; left empty they are kept, as long as the URLs stay the same. A
 * configuration a file provisioned is read-only here.
 */
@Component({
  selector: 'app-registrar-settings',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    NgIcon,
    HlmButtonImports,
    HlmFieldImports,
    HlmInputImports,
    HlmNativeSelectImports,
    HlmSkeletonImports,
    HlmSpinnerImports,
    HlmTooltipImports,
    OwnershipNotice,
    PageHeader,
  ],
  providers: [
    provideIcons({
      lucideCircleCheck,
      lucideCircleDashed,
      lucideEye,
      lucideEyeOff,
      lucideInfo,
      lucideLock,
      lucideTrash2,
      lucideTriangleAlert,
    }),
  ],
  templateUrl: './registrar-settings.html',
})
export class RegistrarSettings {
  private readonly instance = inject(SessionService).getBaseUrl();
  private readonly caller = inject(CallerService).loadedCaller;
  private readonly tenant = computed(() => this.caller()?.tenantId);
  private readonly queryClient = inject(QueryClient);
  private readonly notify = inject(NotifyService);
  private readonly confirm = inject(ConfirmService);
  private readonly injector = inject(Injector);
  private readonly formElement = viewChild<ElementRef<HTMLFormElement>>('formElement');

  protected readonly config = injectQuery(() => ({
    ...registrarConfigQuery(this.instance, this.tenant()),
    // Edit what the backend has now, not what an earlier visit cached.
    staleTime: 0,
  }));
  private readonly ownership = injectQuery(() =>
    configOwnershipQuery(this.instance, this.tenant(), 'RegistrarConfig')
  );
  protected readonly owner = computed(() =>
    this.ownership.data()?.find((resource) => resource.resourceId === RESOURCE_ID)
  );
  protected readonly locked = computed(() => {
    const managed = fileManaged(this.ownership.data()).get(RESOURCE_ID);
    return managed ? lockReason(managed) : '';
  });

  protected readonly form = createRegistrarForm();
  protected readonly presets = REGISTRAR_PRESETS;
  protected readonly showSecret = signal(false);
  protected readonly showPassword = signal(false);

  private readonly create = injectMutation(() => createRegistrarConfigMutation());
  private readonly update = injectMutation(() => updateRegistrarConfigMutation());
  private readonly remove = injectMutation(() => deleteRegistrarConfigMutation());
  protected readonly saving = computed(() => this.create.isPending() || this.update.isPending());
  protected readonly deleting = this.remove.isPending;

  constructor() {
    // Show the stored configuration, unless the user changed the form already.
    effect(() => {
      if (!this.config.isSuccess()) return;
      const stored = this.config.data();
      untracked(() => {
        if (!this.form.dirty) fillRegistrarForm(this.form, stored);
      });
    });
  }

  protected stored(): RegistrarConfigResponseDto | null {
    return this.form.context.stored;
  }

  /** Whether the URLs differ from the stored ones, so the stored secrets are not kept. */
  protected urlsChanged(): boolean {
    return urlsChanged(this.form);
  }

  protected applyPreset(name: string): void {
    const preset = this.presets.find((entry) => entry.name === name);
    if (!preset) return;
    this.form.patchValue({
      registrarUrl: preset.registrarUrl,
      oidcUrl: preset.oidcUrl,
      clientId: preset.clientId,
    });
    this.form.markAsDirty();
    this.notify.info(`Filled in the ${preset.name}. Enter your account.`);
  }

  protected save(): void {
    if (this.saving() || this.deleting() || this.locked()) return;
    if (this.form.invalid) {
      const controls = this.form.controls;
      const sections: FormSection[] = [
        {
          name: 'Connection',
          controls: [
            controls.registrarUrl,
            controls.oidcUrl,
            controls.clientId,
            controls.username,
            controls.password,
          ],
        },
        {
          name: 'Relying party contact',
          controls: [controls.supportUri, controls.email, controls.phone],
        },
      ];
      showFieldsToFix(this.form, {
        notify: this.notify,
        injector: this.injector,
        container: () => this.formElement()?.nativeElement,
        sections,
      });
      return;
    }
    const request = registrarRequest(this.form);
    const handlers = {
      onSuccess: (saved: RegistrarConfigResponseDto) => {
        this.queryClient.setQueryData(registrarConfigKey(this.instance, this.tenant()), saved);
        // The secrets are stored now; sending them again would check the credentials again.
        fillRegistrarForm(this.form, saved);
        this.showSecret.set(false);
        this.showPassword.set(false);
        this.notify.success('Registrar configuration saved.');
      },
      onError: (error: Error) =>
        this.notify.error(
          getApiErrorMessage(error, 'Failed to save the registrar configuration', {
            allIssues: true,
          })
        ),
    };
    if (request.method === 'PATCH') this.update.mutate(request.body, handlers);
    else this.create.mutate(request.body, handlers);
  }

  protected async delete(): Promise<void> {
    const stored = this.stored();
    if (!stored || this.saving() || this.deleting() || this.locked()) return;
    const restore =
      this.owner()?.ownership === 'detached'
        ? `A startup import from ${this.owner()?.source || 'its configuration folder'} can restore it.`
        : 'This cannot be undone.';
    const confirmed = await this.confirm.ask({
      title: 'Delete the registrar configuration?',
      description: [
        `Its URLs, account, stored ${stored.hasClientSecret ? 'password and client secret' : 'password'}, relying party contact and registration certificate defaults are removed.`,
        'Until the registrar is configured again, presentation requests carry no registration certificates, and no access or registration certificates can be requested.',
        restore,
      ],
      confirm: 'Delete configuration',
      destructive: true,
    });
    if (!confirmed) return;
    this.remove.mutate(undefined, {
      onSuccess: () => {
        this.queryClient.setQueryData(registrarConfigKey(this.instance, this.tenant()), null);
        void this.ownership.refetch();
        fillRegistrarForm(this.form, null);
        this.notify.success('Registrar configuration deleted.');
      },
      onError: (error) =>
        this.notify.error(
          getApiErrorMessage(error, 'Failed to delete the registrar configuration')
        ),
    });
  }

  protected discard(): void {
    fillRegistrarForm(this.form, this.stored());
  }

  protected errorMessage(error: unknown): string {
    return getApiErrorMessage(error, 'Failed to load the registrar configuration');
  }
}
