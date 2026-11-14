import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import type { FederationTrustAnchorResponseDto } from '@eudiplo/sdk-core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { HlmSpinnerImports } from '@spartan-ng/helm/spinner';
import { ConfigDocumentService } from '../../../shared/config-ownership/config-document.service';
import {
  lucideArrowLeft,
  lucideCopy,
  lucideDownload,
  lucideKeyRound,
  lucideLock,
  lucidePencil,
  lucideTrash2,
  lucideTriangleAlert,
} from '@ng-icons/lucide';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import { HlmSkeletonImports } from '@spartan-ng/helm/skeleton';
import { HlmTableImports } from '@spartan-ng/helm/table';
import { HlmTooltipImports } from '@spartan-ng/helm/tooltip';
import { injectMutation, injectQuery, QueryClient } from '@tanstack/angular-query-experimental';
import { CallerService } from '../../../core/auth/caller.service';
import { SessionService } from '../../../core/auth/session.service';
import { getApiErrorMessage, hasHttpStatus } from '../../../core/errors/error-message';
import { NotifyService } from '../../../core/notify/notify.service';
import {
  configOwnershipQuery,
  fileManaged,
  lockReason,
} from '../../../shared/config-ownership/config-ownership';
import { OwnershipNotice } from '../../../shared/config-ownership/ownership-notice';
import { copyText } from '../../../shared/clipboard/copy-text';
import { PageHeader } from '../../../shared/pages/page-header';
import { issuanceConfigQuery } from '../../issuance/data/issuance-queries';
import { presentationConfigsQuery } from '../../presentation-configs/data/presentation-config-queries';
import {
  deleteFederationTrustAnchorMutation,
  federationTrustAnchorQuery,
  federationTrustAnchorsKey,
} from '../data/federation-trust-anchor-queries';
import {
  describeFederationTrustAnchorReferences,
  referencesToFederationTrustAnchor,
} from '../data/federation-trust-anchor-references';
import { ConfirmService } from '../../../shared/dialogs/confirm';

interface PinnedKey {
  kid?: string;
  kty?: string;
  crv?: string;
  alg?: string;
  use?: string;
}

@Component({
  selector: 'app-federation-trust-anchor-detail',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    HlmSpinnerImports,
    RouterLink,
    NgIcon,
    HlmButtonImports,
    HlmSkeletonImports,
    HlmTableImports,
    HlmTooltipImports,
    OwnershipNotice,
    PageHeader,
  ],
  providers: [
    provideIcons({
      lucideArrowLeft,
      lucideCopy,
      lucideDownload,
      lucideKeyRound,
      lucideLock,
      lucidePencil,
      lucideTrash2,
      lucideTriangleAlert,
    }),
  ],
  templateUrl: './federation-trust-anchor-detail.html',
})
export class FederationTrustAnchorDetail {
  readonly id = input.required<string>();

  private readonly instance = inject(SessionService).getBaseUrl();
  private readonly callerService = inject(CallerService);
  private readonly caller = this.callerService.loadedCaller;
  private readonly tenant = computed(() => this.caller()?.tenantId);
  private readonly router = inject(Router);
  private readonly queryClient = inject(QueryClient);
  private readonly notify = inject(NotifyService);
  private readonly confirm = inject(ConfirmService);
  protected readonly documents = inject(ConfigDocumentService);

  protected readonly anchor = injectQuery(() =>
    federationTrustAnchorQuery(this.instance, this.tenant(), this.id())
  );
  private readonly ownership = injectQuery(() =>
    configOwnershipQuery(this.instance, this.tenant(), 'FederationTrustAnchor')
  );
  private readonly managed = computed(() => fileManaged(this.ownership.data()).get(this.id()));
  protected readonly locked = computed(() => (this.managed() ? lockReason(this.managed()!) : ''));
  protected readonly canReadIssuance = computed(() =>
    this.caller()?.roles.includes('issuance:manage')
  );
  protected readonly canReadPresentations = computed(() =>
    this.caller()?.roles.includes('presentation:manage')
  );

  protected readonly issuance = injectQuery(() => ({
    ...issuanceConfigQuery(this.instance, this.tenant()),
    enabled: !!this.instance && !!this.canReadIssuance(),
  }));
  protected readonly presentations = injectQuery(() => ({
    ...presentationConfigsQuery(this.instance, this.tenant()),
    enabled: !!this.instance && !!this.canReadPresentations(),
  }));

  protected readonly references = computed(() =>
    referencesToFederationTrustAnchor(
      this.anchor.data()?.entityId ?? '',
      this.issuance.data(),
      this.presentations.data()
    )
  );
  protected readonly referencesLoading = computed(
    () =>
      (this.canReadIssuance() && this.issuance.isPending()) ||
      (this.canReadPresentations() && this.presentations.isPending())
  );
  protected readonly referenceDescription = computed(() =>
    describeFederationTrustAnchorReferences(this.references())
  );
  protected readonly deleteBlocked = computed(() => !!this.referenceDescription());
  protected readonly deleting = computed(() => this.deleteAnchor.isPending());

  private readonly deleteAnchor = injectMutation(() => deleteFederationTrustAnchorMutation());

  protected readonly keys = computed(() => {
    const keys = this.anchor.data()?.jwks['keys'];
    return Array.isArray(keys) ? (keys as PinnedKey[]) : [];
  });
  protected readonly jwksJson = computed(() => {
    const jwks = this.anchor.data()?.jwks;
    return jwks ? JSON.stringify(jwks, null, 2) : '';
  });

  protected errorMessage(error: unknown): string {
    return getApiErrorMessage(error, 'Failed to load the trust anchor');
  }

  protected notFound(error: unknown): boolean {
    return hasHttpStatus(error, 404);
  }

  protected lockedAction(reason: string): void {
    if (reason) this.notify.error(reason);
  }

  protected async copyEntityId(entityId: string): Promise<void> {
    await copyText(this.notify, entityId, 'Entity ID');
  }

  protected async copyJwks(): Promise<void> {
    await copyText(this.notify, this.jwksJson(), 'JWK set');
  }

  protected deleteQuestion(anchor: FederationTrustAnchorResponseDto): string {
    const name = anchor.description ? `"${anchor.description}" (${anchor.id})` : `"${anchor.id}"`;
    return `Delete trust anchor ${name}? If a configuration names its entity ID, the delete is refused and the configurations are named. This cannot be undone.`;
  }

  protected async delete(): Promise<void> {
    const anchor = this.anchor.data();
    if (!anchor || this.deleting() || this.referencesLoading()) return;
    if (this.locked()) {
      this.notify.error(this.locked());
      return;
    }
    if (this.deleteBlocked()) {
      const name = anchor.description ? `"${anchor.description}" (${anchor.id})` : `"${anchor.id}"`;
      this.notify.error(
        `Trust anchor ${name} is still named by ${this.referenceDescription()}. Remove these references before deleting it.`
      );
      return;
    }
    const confirmed = await this.confirm.ask({
      title: 'Delete this trust anchor?',
      description: this.deleteQuestion(anchor),
      confirm: 'Delete trust anchor',
      destructive: true,
    });
    if (!confirmed) return;
    this.deleteAnchor.mutate(anchor.id, {
      onSuccess: () => {
        void this.queryClient.invalidateQueries({
          queryKey: federationTrustAnchorsKey(this.instance, this.tenant()),
          exact: true,
        });
        this.notify.success('Trust anchor deleted.');
        void this.router.navigate(['/federation-trust-anchor']);
      },
      onError: (error) => {
        this.notify.error(getApiErrorMessage(error, 'Failed to delete the trust anchor'));
        if (hasHttpStatus(error, 409)) {
          if (this.canReadIssuance()) void this.issuance.refetch();
          if (this.canReadPresentations()) void this.presentations.refetch();
        }
      },
    });
  }

  protected download(): void {
    void this.documents.download('FederationTrustAnchor', this.id());
  }

  protected downloading(): boolean {
    return this.documents.isDownloading('FederationTrustAnchor', this.id());
  }
}
