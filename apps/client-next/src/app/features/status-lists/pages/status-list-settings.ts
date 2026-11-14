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
import { FormGroup, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import type { StatusListConfig } from '@eudiplo/sdk-core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideArrowLeft,
  lucideInfo,
  lucideLock,
  lucideRotateCcw,
  lucideTriangleAlert,
} from '@ng-icons/lucide';
import { HlmAlertDialogImports } from '@spartan-ng/helm/alert-dialog';
import { HlmButtonImports } from '@spartan-ng/helm/button';
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
import { StatusListSettingsFields } from '../components/status-list-settings-fields';
import { resetConsequences, storedSettings } from '../data/status-list-display';
import {
  resetStatusListConfigMutation,
  saveStatusListConfigMutation,
  statusListConfigKey,
  statusListConfigQuery,
} from '../data/status-list-queries';
import {
  statusListSettingsBody,
  statusListSettingsControls,
  statusListSettingsValue,
} from '../data/status-list-settings-form';

/** The tenant's settings are part of its configuration file, `info.json`. */
const TENANT_RESOURCE = 'tenant';

/**
 * The tenant's status list settings: how big new lists are, how long a signed list is valid,
 * when it is republished and whether it links to the others. Each setting the tenant leaves
 * empty follows the instance's environment variable; a reset removes all the tenant's own.
 */
@Component({
  selector: 'app-status-list-settings',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    RouterLink,
    NgIcon,
    HlmAlertDialogImports,
    HlmButtonImports,
    HlmSkeletonImports,
    HlmSpinnerImports,
    HlmTooltipImports,
    OwnershipNotice,
    PageHeader,
    StatusListSettingsFields,
  ],
  providers: [
    provideIcons({ lucideArrowLeft, lucideInfo, lucideLock, lucideRotateCcw, lucideTriangleAlert }),
  ],
  templateUrl: './status-list-settings.html',
})
export class StatusListSettings {
  private readonly instance = inject(SessionService).getBaseUrl();
  private readonly caller = inject(CallerService).loadedCaller;
  private readonly tenant = computed(() => this.caller()?.tenantId);
  private readonly queryClient = inject(QueryClient);
  private readonly notify = inject(NotifyService);
  private readonly injector = inject(Injector);
  private readonly formElement = viewChild<ElementRef<HTMLFormElement>>('formElement');

  protected readonly settings = injectQuery(() =>
    statusListConfigQuery(this.instance, this.tenant())
  );
  private readonly ownership = injectQuery(() =>
    configOwnershipQuery(this.instance, this.tenant(), 'Tenant')
  );
  protected readonly owner = computed(() =>
    this.ownership.data()?.find((resource) => resource.resourceId === TENANT_RESOURCE)
  );
  /** Why the settings cannot be changed here, or nothing when they can. */
  protected readonly locked = computed(() => {
    const managed = fileManaged(this.ownership.data()).get(TENANT_RESOURCE);
    return managed ? lockReason(managed) : '';
  });

  protected readonly form = new FormGroup(statusListSettingsControls());

  private readonly saveSettings = injectMutation(() => saveStatusListConfigMutation());
  private readonly resetSettings = injectMutation(() => resetStatusListConfigMutation());
  protected readonly busy = computed(
    () => this.saveSettings.isPending() || this.resetSettings.isPending()
  );

  protected readonly stored = computed(() => storedSettings(this.settings.data()).length);
  protected readonly consequences = computed(() => resetConsequences(this.settings.data()));
  protected readonly confirmingReset = signal(false);

  constructor() {
    // Show the stored settings, unless the user changed the form already.
    effect(() => {
      const settings = this.settings.data();
      if (!settings) return;
      untracked(() => {
        if (!this.form.dirty) this.fill(settings);
      });
    });
  }

  protected save(): void {
    if (this.busy() || this.locked()) return;
    if (this.form.invalid) {
      showFieldsToFix(this.form, {
        notify: this.notify,
        injector: this.injector,
        container: () => this.formElement()?.nativeElement,
      });
      return;
    }
    this.saveSettings.mutate(statusListSettingsBody(this.form.getRawValue()), {
      onSuccess: (saved) => {
        this.remember(saved ?? {});
        this.notify.success('Status list settings saved.');
      },
      onError: (error) =>
        this.notify.error(getApiErrorMessage(error, 'Failed to save the status list settings')),
    });
  }

  protected reset(): void {
    if (this.busy()) return;
    this.resetSettings.mutate(undefined, {
      onSuccess: () => {
        this.confirmingReset.set(false);
        this.remember({});
        this.notify.success('Status list settings reset. The instance defaults apply.');
      },
      onError: (error) => {
        this.confirmingReset.set(false);
        this.notify.error(getApiErrorMessage(error, 'Failed to reset the status list settings'));
      },
    });
  }

  protected discard(): void {
    this.fill(this.settings.data() ?? {});
  }

  protected onResetDialog(state: string): void {
    if (state === 'closed' && !this.resetSettings.isPending()) this.confirmingReset.set(false);
  }

  protected errorMessage(error: unknown): string {
    return getApiErrorMessage(error, 'Failed to load the status list settings');
  }

  /** Takes `config` as what is stored, in the cache, the form and the tenant's page. */
  private remember(config: StatusListConfig): void {
    this.queryClient.setQueryData(statusListConfigKey(this.instance, this.tenant()), config);
    void this.queryClient.invalidateQueries({ queryKey: ['tenants'] });
    this.fill(config);
  }

  private fill(config: StatusListConfig): void {
    this.form.reset(statusListSettingsValue(config));
  }
}
