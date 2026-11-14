import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideChevronRight,
  lucideKeyRound,
  lucideLock,
  lucidePencil,
  lucidePlus,
  lucideTriangleAlert,
} from '@ng-icons/lucide';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import { HlmSkeletonImports } from '@spartan-ng/helm/skeleton';
import { HlmTableImports } from '@spartan-ng/helm/table';
import { HlmTooltipImports } from '@spartan-ng/helm/tooltip';
import { injectQuery } from '@tanstack/angular-query-experimental';
import { CallerService } from '../../../core/auth/caller.service';
import { SessionService } from '../../../core/auth/session.service';
import { getApiErrorMessage } from '../../../core/errors/error-message';
import {
  configOwnershipQuery,
  fileManaged,
  lockReason,
} from '../../../shared/config-ownership/config-ownership';
import { PageHeader } from '../../../shared/pages/page-header';
import { federationTrustAnchorsQuery } from '../data/federation-trust-anchor-queries';

@Component({
  selector: 'app-federation-trust-anchor-list',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    NgIcon,
    HlmButtonImports,
    HlmSkeletonImports,
    HlmTableImports,
    HlmTooltipImports,
    PageHeader,
  ],
  providers: [
    provideIcons({
      lucideChevronRight,
      lucideKeyRound,
      lucideLock,
      lucidePencil,
      lucidePlus,
      lucideTriangleAlert,
    }),
  ],
  templateUrl: './federation-trust-anchor-list.html',
})
export class FederationTrustAnchorList {
  private readonly instance = inject(SessionService).getBaseUrl();
  private readonly caller = inject(CallerService).loadedCaller;
  private readonly tenant = computed(() => this.caller()?.tenantId);

  protected readonly anchors = injectQuery(() =>
    federationTrustAnchorsQuery(this.instance, this.tenant())
  );
  private readonly ownership = injectQuery(() =>
    configOwnershipQuery(this.instance, this.tenant(), 'FederationTrustAnchor')
  );
  private readonly managed = computed(() => fileManaged(this.ownership.data()));

  protected locked(id: string): string {
    const owner = this.managed().get(id);
    return owner ? lockReason(owner) : '';
  }

  protected keyCount(jwks: Record<string, unknown>): number {
    const keys = jwks['keys'];
    return Array.isArray(keys) ? keys.length : 0;
  }

  protected errorMessage(error: unknown): string {
    return getApiErrorMessage(error, 'Failed to load federation trust anchors');
  }
}
