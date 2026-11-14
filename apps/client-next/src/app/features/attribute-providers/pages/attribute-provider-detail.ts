import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import type { AttributeProviderEntity } from '@eudiplo/sdk-core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideArrowLeft,
  lucideCopy,
  lucideDatabaseZap,
  lucideDownload,
  lucideIdCard,
  lucideKeyRound,
  lucideLock,
  lucidePencil,
  lucideShieldOff,
  lucideTrash2,
  lucideTriangleAlert,
} from '@ng-icons/lucide';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import { HlmSkeletonImports } from '@spartan-ng/helm/skeleton';
import { HlmSpinnerImports } from '@spartan-ng/helm/spinner';
import { HlmTooltipImports } from '@spartan-ng/helm/tooltip';
import { injectQuery } from '@tanstack/angular-query-experimental';
import { CallerService } from '../../../core/auth/caller.service';
import { SessionService } from '../../../core/auth/session.service';
import { getApiErrorMessage, hasHttpStatus } from '../../../core/errors/error-message';
import { NotifyService } from '../../../core/notify/notify.service';
import { copyText } from '../../../shared/clipboard/copy-text';
import { ConfigDocumentService } from '../../../shared/config-ownership/config-document.service';
import {
  configOwnershipQuery,
  fileManaged,
  lockReason,
} from '../../../shared/config-ownership/config-ownership';
import { OwnershipNotice } from '../../../shared/config-ownership/ownership-notice';
import { PageHeader } from '../../../shared/pages/page-header';
import { displayName } from '../../credential-configs/data/credential-config-display';
import { credentialConfigsQuery } from '../../issuance/data/issuance-queries';
import { DeleteAttributeProviderDialog } from '../components/delete-attribute-provider-dialog';
import { hostOf } from '../../../shared/api-key-endpoint/endpoint-display';
import { attributeProviderQuery } from '../data/attribute-provider-queries';

/**
 * One attribute provider: where EUDIPLO calls it, how it authenticates (never the key itself) and
 * which credential types fetch their claims from it. It can be edited, downloaded as a
 * configuration file and deleted; a provider a file provisioned is read-only here.
 */
@Component({
  selector: 'app-attribute-provider-detail',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    NgIcon,
    HlmButtonImports,
    HlmSkeletonImports,
    HlmSpinnerImports,
    HlmTooltipImports,
    DeleteAttributeProviderDialog,
    OwnershipNotice,
    PageHeader,
  ],
  providers: [
    provideIcons({
      lucideArrowLeft,
      lucideCopy,
      lucideDatabaseZap,
      lucideDownload,
      lucideIdCard,
      lucideKeyRound,
      lucideLock,
      lucidePencil,
      lucideShieldOff,
      lucideTrash2,
      lucideTriangleAlert,
    }),
  ],
  templateUrl: './attribute-provider-detail.html',
})
export class AttributeProviderDetail {
  /** The provider's ID, from the route. */
  readonly id = input.required<string>();

  private readonly instance = inject(SessionService).getBaseUrl();
  private readonly caller = inject(CallerService).loadedCaller;
  private readonly tenant = computed(() => this.caller()?.tenantId);
  private readonly router = inject(Router);
  private readonly notify = inject(NotifyService);
  protected readonly documents = inject(ConfigDocumentService);

  protected readonly provider = injectQuery(() =>
    attributeProviderQuery(this.instance, this.tenant(), this.id())
  );
  protected readonly configs = injectQuery(() =>
    credentialConfigsQuery(this.instance, this.tenant())
  );
  private readonly ownership = injectQuery(() =>
    configOwnershipQuery(this.instance, this.tenant(), 'AttributeProvider')
  );
  protected readonly owner = computed(() =>
    this.ownership.data()?.find((resource) => resource.resourceId === this.id())
  );
  /** Why the provider cannot be changed here, or nothing when it can. */
  protected readonly locked = computed(() => {
    const managed = fileManaged(this.ownership.data()).get(this.id());
    return managed ? lockReason(managed) : '';
  });

  /** The credential types that fetch their claims from this provider. */
  protected readonly usedBy = computed(() =>
    (this.configs.data() ?? []).filter((config) => config.attributeProviderId === this.id())
  );
  protected readonly usedByIds = computed(() => this.usedBy().map((config) => config.id));
  protected readonly toDelete = signal<AttributeProviderEntity | null>(null);

  protected readonly displayName = displayName;
  protected readonly hostOf = hostOf;

  protected headerOf(provider: AttributeProviderEntity): string {
    return (provider.auth as { config?: { headerName?: string } }).config?.headerName ?? '';
  }

  protected download(): void {
    void this.documents.download('AttributeProvider', this.id());
  }

  protected downloading(): boolean {
    return this.documents.isDownloading('AttributeProvider', this.id());
  }

  protected copyUrl(url: string): void {
    void copyText(this.notify, url, 'URL');
  }

  protected onDeleted(): void {
    void this.router.navigate(['/attribute-providers']);
  }

  protected notFound(error: unknown): boolean {
    return hasHttpStatus(error, 404);
  }

  protected errorMessage(error: unknown): string {
    return getApiErrorMessage(error, 'Failed to load the attribute provider');
  }
}
