import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideCheckCircle2,
  lucideCircleHelp,
  lucideFileKey2,
  lucideKeyRound,
  lucideLockKeyhole,
  lucidePencil,
  lucideRefreshCw,
  lucideRotateCcw,
  lucideSave,
  lucideTriangleAlert,
  lucideX,
} from '@ng-icons/lucide';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import { HlmSkeletonImports } from '@spartan-ng/helm/skeleton';
import { HlmTextareaImports } from '@spartan-ng/helm/textarea';
import { HlmTooltipImports } from '@spartan-ng/helm/tooltip';
import { injectMutation, injectQuery, QueryClient } from '@tanstack/angular-query-experimental';
import { CallerService } from '../../../core/auth/caller.service';
import { TENANT_ADMIN_ROLES } from '../../../core/auth/role-grants';
import { SessionService } from '../../../core/auth/session.service';
import { getApiErrorMessage, hasHttpStatus } from '../../../core/errors/error-message';
import { NotifyService } from '../../../core/notify/notify.service';
import {
  configOwnershipQuery,
  fileManaged,
  lockReason,
} from '../../../shared/config-ownership/config-ownership';
import { OwnershipNotice } from '../../../shared/config-ownership/ownership-notice';
import { PageHeader } from '../../../shared/pages/page-header';
import { formatKmsConfig, parseKmsConfigJson } from '../data/kms-config-editor';
import {
  kmsProvidersKey,
  kmsProvidersQuery,
  resetTenantKmsConfigMutation,
  saveTenantKmsConfigMutation,
  tenantKmsConfigKey,
  tenantKmsConfigQuery,
} from '../data/kms-queries';

const KMS_RESOURCE_ID = 'kms';
const FORBIDDEN_MESSAGE = 'This action requires the tenant:admin or tenants:manage role.';

@Component({
  selector: 'app-kms-providers',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    RouterLink,
    NgIcon,
    HlmButtonImports,
    HlmSkeletonImports,
    HlmTextareaImports,
    HlmTooltipImports,
    OwnershipNotice,
    PageHeader,
  ],
  providers: [
    provideIcons({
      lucideCheckCircle2,
      lucideCircleHelp,
      lucideFileKey2,
      lucideKeyRound,
      lucideLockKeyhole,
      lucidePencil,
      lucideRefreshCw,
      lucideRotateCcw,
      lucideSave,
      lucideTriangleAlert,
      lucideX,
    }),
  ],
  templateUrl: './kms-providers.html',
})
export class KmsProviders {
  private readonly instance = inject(SessionService).getBaseUrl();
  private readonly caller = inject(CallerService).loadedCaller;
  private readonly tenant = computed(() => this.caller()?.tenantId);
  private readonly queryClient = inject(QueryClient);
  private readonly notify = inject(NotifyService);

  protected readonly canManageTenantConfig = computed(() => {
    const caller = this.caller();
    return !!caller && TENANT_ADMIN_ROLES.some((role) => caller.roles.includes(role));
  });

  protected readonly overview = injectQuery(() => kmsProvidersQuery(this.instance, this.tenant()));
  protected readonly tenantConfig = injectQuery(() =>
    tenantKmsConfigQuery(this.instance, this.tenant(), this.canManageTenantConfig())
  );
  private readonly ownership = injectQuery(() =>
    configOwnershipQuery(this.instance, this.tenant(), 'KmsConfig', this.canManageTenantConfig())
  );

  protected readonly owner = computed(() =>
    this.ownership.data()?.find((resource) => resource.resourceId === KMS_RESOURCE_ID)
  );
  /** Fail closed while ownership is unknown, or if its lookup failed. */
  protected readonly ownershipLock = computed(() => {
    if (!this.canManageTenantConfig()) return '';
    if (this.ownership.isPending()) return 'Checking KMS configuration ownership…';
    if (this.ownership.isError())
      return 'Could not verify KMS configuration ownership. Retry the check.';
    const managed = fileManaged(this.ownership.data()).get(KMS_RESOURCE_ID);
    return managed ? lockReason(managed) : '';
  });

  protected readonly rows = computed(() => {
    const data = this.overview.data();
    if (!data) return [];
    const health = new Map(data.health.map((item) => [item.providerId, item]));
    return data.providers.map((provider) => ({
      provider,
      health: health.get(provider.name),
      isDefault: provider.name === data.default,
    }));
  });

  protected readonly editorText = new FormControl('', { nonNullable: true });
  protected readonly editing = signal(false);
  protected readonly confirmingReset = signal(false);
  private readonly saveConfig = injectMutation(() => saveTenantKmsConfigMutation());
  private readonly resetConfig = injectMutation(() => resetTenantKmsConfigMutation());
  protected readonly saving = computed(
    () => this.saveConfig.isPending() || this.resetConfig.isPending()
  );
  protected readonly hasTenantConfig = computed(() => !!this.tenantConfig.data()?.tenantConfig);
  protected readonly configActionReason = computed(() => {
    if (this.tenantConfig.isPending()) return 'Loading the tenant KMS configuration…';
    if (this.tenantConfig.isError()) return 'Retry loading the tenant KMS configuration first.';
    if (this.ownershipLock()) return this.ownershipLock();
    if (this.saving()) return 'Saving the tenant KMS configuration…';
    return '';
  });

  protected beginEdit(): void {
    if (!this.canChangeConfig()) return;
    this.editorText.setValue(formatKmsConfig(this.tenantConfig.data()?.tenantConfig));
    this.editing.set(true);
    this.confirmingReset.set(false);
  }

  protected cancelEdit(): void {
    if (this.saving()) return;
    this.editing.set(false);
  }

  protected saveTenantConfig(): void {
    if (!this.canChangeConfig()) return;
    const parsed = parseKmsConfigJson(this.editorText.value);
    if ('error' in parsed) {
      this.notify.error(parsed.error);
      return;
    }

    this.saveConfig.mutate(parsed.config, {
      onSuccess: (saved) => {
        this.queryClient.setQueryData(tenantKmsConfigKey(this.instance, this.tenant()), saved);
        this.editing.set(false);
        this.notify.success('Tenant KMS configuration saved.');
        void this.queryClient.invalidateQueries({
          queryKey: kmsProvidersKey(this.instance, this.tenant()),
        });
        void this.invalidateOwnership();
      },
      onError: (error) =>
        this.notify.error(
          hasHttpStatus(error, 403)
            ? FORBIDDEN_MESSAGE
            : getApiErrorMessage(error, 'Failed to save the tenant KMS configuration')
        ),
    });
  }

  protected askToReset(): void {
    if (!this.canChangeConfig() || !this.hasTenantConfig()) return;
    this.confirmingReset.set(true);
    this.editing.set(false);
  }

  protected resetTenantConfig(): void {
    if (!this.canChangeConfig() || !this.hasTenantConfig()) return;
    this.resetConfig.mutate(undefined, {
      onSuccess: () => {
        this.confirmingReset.set(false);
        this.notify.success('Tenant KMS configuration reset to the global defaults.');
        void this.queryClient.invalidateQueries({
          queryKey: tenantKmsConfigKey(this.instance, this.tenant()),
        });
        void this.queryClient.invalidateQueries({
          queryKey: kmsProvidersKey(this.instance, this.tenant()),
        });
        void this.invalidateOwnership();
      },
      onError: (error) => {
        this.confirmingReset.set(false);
        this.notify.error(
          hasHttpStatus(error, 403)
            ? FORBIDDEN_MESSAGE
            : getApiErrorMessage(error, 'Failed to reset the tenant KMS configuration')
        );
      },
    });
  }

  protected async refresh(): Promise<void> {
    if (this.overview.isFetching()) return;
    await this.overview.refetch();
    if (this.canManageTenantConfig()) {
      await Promise.all([this.tenantConfig.refetch(), this.ownership.refetch()]);
    }
  }

  protected errorMessage(error: unknown): string {
    return getApiErrorMessage(error, 'Failed to load KMS providers');
  }

  private canChangeConfig(): boolean {
    return (
      this.canManageTenantConfig() &&
      !this.configActionReason() &&
      !this.tenantConfig.isError() &&
      !this.ownership.isError()
    );
  }

  private invalidateOwnership(): Promise<void> {
    return this.queryClient.invalidateQueries({
      queryKey: ['config-ownership', this.instance, this.tenant(), 'KmsConfig'],
    });
  }
}
