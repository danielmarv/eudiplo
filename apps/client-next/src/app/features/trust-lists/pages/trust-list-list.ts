import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { TrustList } from '@eudiplo/sdk-core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideDownload,
  lucideLock,
  lucidePencil,
  lucidePlus,
  lucideSearch,
  lucideShieldCheck,
  lucideTriangleAlert,
  lucideX,
} from '@ng-icons/lucide';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import { HlmInputGroupImports } from '@spartan-ng/helm/input-group';
import { HlmSkeletonImports } from '@spartan-ng/helm/skeleton';
import { HlmTableImports } from '@spartan-ng/helm/table';
import { HlmTooltipImports } from '@spartan-ng/helm/tooltip';
import { injectQuery } from '@tanstack/angular-query-experimental';
import { CallerService } from '../../../core/auth/caller.service';
import { SessionService } from '../../../core/auth/session.service';
import { getApiErrorMessage } from '../../../core/errors/error-message';
import { ConfigDocumentService } from '../../../shared/config-ownership/config-document.service';
import {
  configOwnershipQuery,
  fileManaged,
  lockReason,
} from '../../../shared/config-ownership/config-ownership';
import { PageHeader } from '../../../shared/pages/page-header';
import { trustListsQuery } from '../data/trust-list-queries';

const EMPTY: TrustList[] = [];

@Component({
  selector: 'app-trust-list-list',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    NgIcon,
    HlmButtonImports,
    HlmInputGroupImports,
    HlmSkeletonImports,
    HlmTableImports,
    HlmTooltipImports,
    PageHeader,
  ],
  providers: [
    provideIcons({
      lucideDownload,
      lucideLock,
      lucidePencil,
      lucidePlus,
      lucideSearch,
      lucideShieldCheck,
      lucideTriangleAlert,
      lucideX,
    }),
  ],
  templateUrl: './trust-list-list.html',
})
export class TrustListList {
  private readonly instance = inject(SessionService).getBaseUrl();
  private readonly caller = inject(CallerService).loadedCaller;
  private readonly tenant = computed(() => this.caller()?.tenantId);
  private readonly documents = inject(ConfigDocumentService);

  protected readonly lists = injectQuery(() => trustListsQuery(this.instance, this.tenant()));
  private readonly ownership = injectQuery(() =>
    configOwnershipQuery(this.instance, this.tenant(), 'TrustList')
  );
  private readonly managed = computed(() => fileManaged(this.ownership.data()));

  protected readonly search = signal('');
  protected readonly filteredLists = computed(() => {
    const query = this.search().trim().toLocaleLowerCase();
    if (!query) return this.lists.data() ?? EMPTY;
    return (this.lists.data() ?? EMPTY).filter((list) =>
      [list.id, list.description].some((value) => value?.toLocaleLowerCase().includes(query))
    );
  });

  protected lockReason(list: TrustList): string {
    const resource = this.managed().get(list.id);
    return resource ? lockReason(resource) : '';
  }

  protected download(list: TrustList): void {
    void this.documents.download('TrustList', list.id);
  }

  protected downloading(list: TrustList): boolean {
    return this.documents.isDownloading('TrustList', list.id);
  }

  protected canDownload(): boolean {
    return this.documents.canDownload('TrustList');
  }

  protected errorMessage(error: unknown): string {
    return getApiErrorMessage(error, 'Failed to load the trust lists');
  }
}
