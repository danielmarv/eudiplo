import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import type { WebhookEndpointEntity } from '@eudiplo/sdk-core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideArrowLeft,
  lucideCopy,
  lucideWebhook,
  lucideDownload,
  lucideIdCard,
  lucideScanLine,
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
import { DeleteWebhookEndpointDialog } from '../components/delete-webhook-endpoint-dialog';
import { hostOf } from '../../../shared/api-key-endpoint/endpoint-display';
import { injectEndpointUsers } from '../data/endpoint-users';
import { webhookEndpointQuery } from '../data/webhook-endpoint-queries';

/**
 * One webhook endpoint: where EUDIPLO calls it, how it authenticates (never the key itself) and
 * which configurations send their notifications to it. It can be edited, downloaded as a
 * configuration file and deleted; an endpoint a file provisioned is read-only here.
 */
@Component({
  selector: 'app-webhook-endpoint-detail',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    NgIcon,
    HlmButtonImports,
    HlmSkeletonImports,
    HlmSpinnerImports,
    HlmTooltipImports,
    DeleteWebhookEndpointDialog,
    OwnershipNotice,
    PageHeader,
  ],
  providers: [
    provideIcons({
      lucideArrowLeft,
      lucideCopy,
      lucideWebhook,
      lucideDownload,
      lucideIdCard,
      lucideScanLine,
      lucideKeyRound,
      lucideLock,
      lucidePencil,
      lucideShieldOff,
      lucideTrash2,
      lucideTriangleAlert,
    }),
  ],
  templateUrl: './webhook-endpoint-detail.html',
})
export class WebhookEndpointDetail {
  /** The endpoint's ID, from the route. */
  readonly id = input.required<string>();

  private readonly instance = inject(SessionService).getBaseUrl();
  private readonly caller = inject(CallerService).loadedCaller;
  private readonly tenant = computed(() => this.caller()?.tenantId);
  private readonly router = inject(Router);
  private readonly notify = inject(NotifyService);
  protected readonly documents = inject(ConfigDocumentService);

  protected readonly endpoint = injectQuery(() =>
    webhookEndpointQuery(this.instance, this.tenant(), this.id())
  );
  protected readonly users = injectEndpointUsers();
  private readonly ownership = injectQuery(() =>
    configOwnershipQuery(this.instance, this.tenant(), 'WebhookEndpoint')
  );
  protected readonly owner = computed(() =>
    this.ownership.data()?.find((resource) => resource.resourceId === this.id())
  );
  /** Why the endpoint cannot be changed here, or nothing when it can. */
  protected readonly locked = computed(() => {
    const managed = fileManaged(this.ownership.data()).get(this.id());
    return managed ? lockReason(managed) : '';
  });

  /** The configurations that send their notifications to this endpoint; empty while unknown. */
  protected readonly usedBy = computed(() => this.users.users()?.get(this.id()) ?? []);
  protected readonly usedByIds = computed(() => this.usedBy().map((user) => user.id));
  protected readonly toDelete = signal<WebhookEndpointEntity | null>(null);

  protected readonly hostOf = hostOf;

  protected headerOf(endpoint: WebhookEndpointEntity): string {
    return (endpoint.auth as { config?: { headerName?: string } }).config?.headerName ?? '';
  }

  protected download(): void {
    void this.documents.download('WebhookEndpoint', this.id());
  }

  protected downloading(): boolean {
    return this.documents.isDownloading('WebhookEndpoint', this.id());
  }

  protected copyUrl(url: string): void {
    void copyText(this.notify, url, 'URL');
  }

  protected onDeleted(): void {
    void this.router.navigate(['/webhook-endpoints']);
  }

  protected notFound(error: unknown): boolean {
    return hasHttpStatus(error, 404);
  }

  protected errorMessage(error: unknown): string {
    return getApiErrorMessage(error, 'Failed to load the webhook endpoint');
  }
}
