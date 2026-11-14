import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { DatePipe, JsonPipe } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import type { PresentationConfig } from '@eudiplo/sdk-core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideArrowLeft,
  lucideBadgeCheck,
  lucideCopy,
  lucideDownload,
  lucideExternalLink,
  lucideFileJson,
  lucidePencil,
  lucidePlus,
  lucideRefreshCw,
  lucideShieldCheck,
  lucideTrash2,
  lucideTriangleAlert,
} from '@ng-icons/lucide';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import { HlmDialogImports } from '@spartan-ng/helm/dialog';
import { HlmSkeletonImports } from '@spartan-ng/helm/skeleton';
import { HlmSpinnerImports } from '@spartan-ng/helm/spinner';
import { HlmTooltipImports } from '@spartan-ng/helm/tooltip';
import { injectMutation, injectQuery, QueryClient } from '@tanstack/angular-query-experimental';
import { CallerService } from '../../../core/auth/caller.service';
import { SessionService } from '../../../core/auth/session.service';
import { getApiErrorMessage } from '../../../core/errors/error-message';
import { NotifyService } from '../../../core/notify/notify.service';
import { ConfigDocumentService } from '../../../shared/config-ownership/config-document.service';
import {
  configOwnershipQuery,
  fileManaged,
  lockReason,
} from '../../../shared/config-ownership/config-ownership';
import { OwnershipNotice } from '../../../shared/config-ownership/ownership-notice';
import { decodeJwtPart } from '../../../shared/format/jwt';
import { PageHeader } from '../../../shared/pages/page-header';
import {
  REGISTRATION_STATUS,
  registrationCertJwt,
  registrationCertStatus,
  statusCheckModeLabel,
  statusCheckModeOf,
} from '../data/presentation-config-display';
import {
  deletePresentationConfigMutation,
  presentationConfigQuery,
  presentationConfigsKey,
  reissueRegistrationCertMutation,
} from '../data/presentation-config-queries';

/**
 * Presents the full request, its verification settings, registration certificate and integration
 * data, with the same edit, copy, offer, download, delete and reissue actions as the current client.
 */
@Component({
  selector: 'app-presentation-config-detail',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
    JsonPipe,
    RouterLink,
    NgIcon,
    HlmButtonImports,
    HlmDialogImports,
    HlmSkeletonImports,
    HlmSpinnerImports,
    HlmTooltipImports,
    OwnershipNotice,
    PageHeader,
  ],
  providers: [
    provideIcons({
      lucideArrowLeft,
      lucideBadgeCheck,
      lucideCopy,
      lucideDownload,
      lucideExternalLink,
      lucideFileJson,
      lucidePencil,
      lucidePlus,
      lucideRefreshCw,
      lucideShieldCheck,
      lucideTrash2,
      lucideTriangleAlert,
    }),
  ],
  templateUrl: './presentation-config-detail.html',
})
export class PresentationConfigDetail {
  readonly id = input.required<string>();

  private readonly instance = inject(SessionService).getBaseUrl();
  private readonly caller = inject(CallerService).loadedCaller;
  private readonly tenant = computed(() => this.caller()?.tenantId);
  private readonly router = inject(Router);
  private readonly queryClient = inject(QueryClient);
  private readonly notify = inject(NotifyService);
  private readonly documents = inject(ConfigDocumentService);

  protected readonly config = injectQuery(() =>
    presentationConfigQuery(this.instance, this.tenant(), this.id())
  );
  private readonly ownership = injectQuery(() =>
    configOwnershipQuery(this.instance, this.tenant(), 'PresentationConfig')
  );
  protected readonly owner = computed(() =>
    this.ownership.data()?.find((resource) => resource.resourceId === this.id())
  );
  protected readonly locked = computed(() => {
    const managed = fileManaged(this.ownership.data()).get(this.id());
    return managed ? lockReason(managed) : '';
  });
  private readonly reissue = injectMutation(() => reissueRegistrationCertMutation());
  private readonly remove = injectMutation(() => deletePresentationConfigMutation());

  protected readonly deleteOpen = signal(false);
  protected readonly deleting = computed(() => this.remove.isPending());
  protected readonly reissuing = computed(() => this.reissue.isPending());
  protected readonly canDownload = computed(() => this.documents.canDownload('PresentationConfig'));
  protected readonly canCreateOffer = computed(
    () => !!this.caller()?.roles.includes('presentation:request')
  );
  protected readonly registrationState = computed(() => {
    const config = this.config.data();
    return config ? registrationCertStatus(config) : 'none';
  });
  protected readonly registrationLabel = computed(
    () => REGISTRATION_STATUS[this.registrationState()]
  );
  protected readonly certificateJwt = computed(() => {
    const config = this.config.data();
    return config ? registrationCertJwt(config) : undefined;
  });
  protected readonly parsedHeader = computed(() => this.jwtPart('header'));
  protected readonly parsedPayload = computed(() => this.jwtPart('payload'));
  protected readonly statusMode = computed(() => {
    const config = this.config.data();
    return config ? statusCheckModeLabel(statusCheckModeOf(config)) : 'Strict';
  });

  protected formatLifetime(seconds: number | undefined): string {
    if (seconds === undefined) return 'Not set';
    if (seconds < 60) return `${seconds} seconds`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)} minutes`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)} hours`;
    return `${Math.floor(seconds / 86400)} days`;
  }

  protected async reissueCertificate(): Promise<void> {
    if (this.reissuing() || this.locked() || this.registrationState() === 'none') return;
    try {
      const updated = await this.reissue.mutateAsync(this.id());
      this.queryClient.setQueryData(
        [...presentationConfigsKey(this.instance, this.tenant()), this.id()],
        updated
      );
      await this.queryClient.invalidateQueries({
        queryKey: presentationConfigsKey(this.instance, this.tenant()),
        exact: true,
      });
      await this.queryClient.removeQueries({
        queryKey: [...presentationConfigsKey(this.instance, this.tenant()), this.id()],
        exact: true,
      });
      this.notify.success('Registration certificate reissued.');
    } catch (error) {
      this.notify.error(
        getApiErrorMessage(error, 'Failed to reissue the registration certificate')
      );
    }
  }

  protected async deleteConfiguration(): Promise<void> {
    if (this.deleting()) return;
    try {
      await this.remove.mutateAsync(this.id());
      await this.queryClient.invalidateQueries({
        queryKey: presentationConfigsKey(this.instance, this.tenant()),
        exact: true,
      });
      this.deleteOpen.set(false);
      this.notify.success(`Presentation configuration ${this.id()} deleted.`);
      await this.router.navigate(['/presentation-config']);
    } catch (error) {
      this.notify.error(
        getApiErrorMessage(error, 'Failed to delete the presentation configuration')
      );
    }
  }

  protected downloadConfiguration(): void {
    void this.documents.download('PresentationConfig', this.id());
  }

  protected jwtPart(part: 'header' | 'payload'): string {
    const jwt = this.certificateJwt();
    if (!jwt) return 'No registration certificate JWT available.';
    try {
      return JSON.stringify(decodeJwtPart(jwt, part), null, 2);
    } catch (error) {
      return error instanceof Error ? error.message : 'Unable to decode the JWT.';
    }
  }

  protected configError(error: unknown): string {
    return getApiErrorMessage(error, 'Failed to load the presentation configuration');
  }

  protected credentialList(config: PresentationConfig): Record<string, unknown>[] {
    const credentials = config.dcql_query?.credentials;
    return Array.isArray(credentials) ? (credentials as unknown as Record<string, unknown>[]) : [];
  }
}
