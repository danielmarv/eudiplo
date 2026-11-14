import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import type { PresentationConfig } from '@eudiplo/sdk-core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideBadgeCheck,
  lucideChevronRight,
  lucideCircleX,
  lucideCircleDashed,
  lucideClock,
  lucideLock,
  lucideMinus,
  lucidePencil,
  lucidePlus,
  lucideSearch,
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
import {
  configOwnershipQuery,
  fileManaged,
  lockReason,
} from '../../../shared/config-ownership/config-ownership';
import { PageHeader } from '../../../shared/pages/page-header';
import { REGISTRATION_STATUS, registrationCertStatus } from '../data/presentation-config-display';
import { presentationConfigsQuery } from '../data/presentation-config-queries';

const EMPTY: PresentationConfig[] = [];

/**
 * The tenant's reusable wallet presentation requests: what they ask for, their status checks and
 * registration certificate state. File-managed configurations remain visible but read-only.
 */
@Component({
  selector: 'app-presentation-config-list',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
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
      lucideBadgeCheck,
      lucideChevronRight,
      lucideCircleX,
      lucideCircleDashed,
      lucideClock,
      lucideLock,
      lucideMinus,
      lucidePencil,
      lucidePlus,
      lucideSearch,
      lucideTriangleAlert,
      lucideX,
    }),
  ],
  templateUrl: './presentation-config-list.html',
})
export class PresentationConfigList {
  private readonly instance = inject(SessionService).getBaseUrl();
  private readonly caller = inject(CallerService).loadedCaller;
  private readonly tenant = computed(() => this.caller()?.tenantId);
  protected readonly configs = injectQuery(() =>
    presentationConfigsQuery(this.instance, this.tenant())
  );
  private readonly ownership = injectQuery(() =>
    configOwnershipQuery(this.instance, this.tenant(), 'PresentationConfig')
  );
  private readonly managed = computed(() => fileManaged(this.ownership.data()));

  protected readonly search = signal('');
  protected readonly filtered = computed(() => {
    const text = this.search().trim().toLowerCase();
    const configs = this.configs.data() ?? EMPTY;
    return text
      ? configs.filter((config) =>
          [config.id, config.description ?? ''].some((value) => value.toLowerCase().includes(text))
        )
      : configs;
  });

  protected readonly registrationStatus = registrationCertStatus;
  protected readonly registrationStatusLabel = REGISTRATION_STATUS;

  constructor() {
    effect(() => {
      if (this.configs.isError()) {
        console.error('Failed to load presentation configurations:', this.configs.error());
      }
    });
  }

  protected lockReason(config: PresentationConfig): string {
    const owner = this.managed().get(config.id);
    return owner ? lockReason(owner) : '';
  }

  protected errorMessage(error: unknown): string {
    return getApiErrorMessage(error, 'Failed to load presentation configurations');
  }
}
