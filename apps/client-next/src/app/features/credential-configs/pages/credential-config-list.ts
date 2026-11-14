import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import type { CredentialConfig } from '@eudiplo/sdk-core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideBraces,
  lucideChevronRight,
  lucideIdCard,
  lucideLock,
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
import {
  type ColumnDef,
  injectTable,
  type PaginationState,
  type SortingState,
} from '@tanstack/angular-table';
import { CallerService } from '../../../core/auth/caller.service';
import { SessionService } from '../../../core/auth/session.service';
import { getApiErrorMessage } from '../../../core/errors/error-message';
import {
  configOwnershipQuery,
  fileManaged,
  lockReason,
} from '../../../shared/config-ownership/config-ownership';
import { SortToggle } from '../../../shared/data-table/sort-toggle';
import {
  ariaSort,
  type ListFeatures,
  listFeatures,
  PAGE_SIZES,
  searchIn,
  type SortableColumn,
} from '../../../shared/data-table/table-features';
import { TablePagination } from '../../../shared/data-table/table-pagination';
import { applyChange } from '../../../shared/data-table/table-state';
import { PageHeader } from '../../../shared/pages/page-header';
import { credentialConfigsQuery } from '../../issuance/data/issuance-queries';
import {
  type CredentialFormat,
  descriptionOf,
  displayName,
  FORMAT_LABELS,
  lifetimeLabel,
  policyLabel,
  schemaIdOf,
} from '../data/credential-config-display';

type FormatFilter = 'all' | CredentialFormat;

const NO_CONFIGS: CredentialConfig[] = [];

const COLUMNS: ColumnDef<ListFeatures, CredentialConfig>[] = [
  { id: 'name', accessorFn: displayName, sortFn: 'alphanumeric' },
  {
    id: 'format',
    accessorFn: (config) => config.config.format,
    sortFn: 'text',
    filterFn: 'equalsString',
  },
  {
    id: 'lifetime',
    // Without a lifetime a credential does not expire: the longest of all.
    accessorFn: (config) => config.lifeTime || Number.MAX_SAFE_INTEGER,
    sortFn: 'basic',
  },
  { id: 'policy', accessorFn: policyLabel, sortFn: 'text' },
];

/**
 * The credentials the issuer can offer: searchable by name, ID, description and type, filtered
 * by format, sorted by column and shown a page at a time. Each shows how long it lasts, what it
 * binds to and what it needs, and opens or edits its configuration. A configuration that a file
 * or bundle provisioned is read-only here, and says so.
 */
@Component({
  selector: 'app-credential-config-list',
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
    SortToggle,
    TablePagination,
  ],
  providers: [
    provideIcons({
      lucideBraces,
      lucideChevronRight,
      lucideIdCard,
      lucideLock,
      lucidePencil,
      lucidePlus,
      lucideSearch,
      lucideTriangleAlert,
      lucideX,
    }),
  ],
  templateUrl: './credential-config-list.html',
})
export class CredentialConfigList {
  private readonly instance = inject(SessionService).getBaseUrl();
  private readonly caller = inject(CallerService).loadedCaller;
  private readonly tenant = computed(() => this.caller()?.tenantId);

  protected readonly configs = injectQuery(() =>
    credentialConfigsQuery(this.instance, this.tenant())
  );
  private readonly ownership = injectQuery(() =>
    configOwnershipQuery(this.instance, this.tenant(), 'CredentialConfig')
  );
  /** The configurations a file or bundle provisioned, which are read-only here. */
  private readonly managed = computed(() => fileManaged(this.ownership.data()));

  /** The schema pages need `registrar:manage`; without it a link would end at "Access denied". */
  protected readonly opensSchemas = computed(
    () => !!this.caller()?.roles.includes('registrar:manage')
  );

  protected readonly search = signal('');
  protected readonly format = signal<FormatFilter>('all');
  private readonly sorting = signal<SortingState>([{ id: 'name', desc: false }]);
  private readonly pagination = signal<PaginationState>({ pageIndex: 0, pageSize: PAGE_SIZES[0] });

  protected readonly table = injectTable(() => ({
    features: listFeatures,
    columns: COLUMNS,
    data: this.configs.data() ?? NO_CONFIGS,
    getRowId: (config) => config.id,
    state: {
      globalFilter: this.search(),
      columnFilters: this.format() === 'all' ? [] : [{ id: 'format', value: this.format() }],
      sorting: this.sorting(),
      pagination: this.pagination(),
    },
    globalFilterFn: searchIn<CredentialConfig>((config) => [
      config.id,
      displayName(config),
      descriptionOf(config),
      typeof config.vct === 'string' ? config.vct : config.vct?.vct,
      config.config.docType,
    ]),
    getColumnCanGlobalFilter: (column) => column.id === 'name',
    enableSortingRemoval: false,
    autoResetPageIndex: false,
    onSortingChange: (change) => {
      applyChange(this.sorting, change);
      this.toFirstPage();
    },
    onPaginationChange: (change) => applyChange(this.pagination, change),
  }));

  protected readonly total = computed(() => this.configs.data()?.length ?? 0);
  protected readonly matching = computed(() => this.table.getPrePaginatedRowModel().rows.length);
  protected readonly filters = computed(() => {
    const all = this.configs.data() ?? NO_CONFIGS;
    const count = (format: CredentialFormat) =>
      all.filter((config) => config.config.format === format).length;
    return [
      { value: 'all' as const, label: 'All', count: all.length },
      { value: 'dc+sd-jwt' as const, label: FORMAT_LABELS['dc+sd-jwt'], count: count('dc+sd-jwt') },
      { value: 'mso_mdoc' as const, label: FORMAT_LABELS.mso_mdoc, count: count('mso_mdoc') },
    ];
  });

  protected readonly ariaSort = ariaSort;
  protected readonly formatLabels = FORMAT_LABELS;
  protected readonly displayName = displayName;
  protected readonly descriptionOf = descriptionOf;
  protected readonly lifetimeLabel = lifetimeLabel;
  protected readonly policyLabel = policyLabel;
  protected readonly schemaIdOf = schemaIdOf;

  constructor() {
    // After the list shrinks below the current page, show the last page there is.
    effect(() => {
      const last = Math.max(0, this.table.getPageCount() - 1);
      if (this.pagination().pageIndex > last) {
        this.pagination.update((page) => ({ ...page, pageIndex: last }));
      }
    });
  }

  protected column(id: string): SortableColumn {
    return this.table.getColumn(id)!;
  }

  protected onSearch(event: Event): void {
    this.search.set((event.target as HTMLInputElement).value);
    this.toFirstPage();
  }

  protected filterBy(format: FormatFilter): void {
    this.format.set(format);
    this.toFirstPage();
  }

  protected clearFilters(): void {
    this.search.set('');
    this.format.set('all');
    this.toFirstPage();
  }

  private toFirstPage(): void {
    this.pagination.update((page) => ({ ...page, pageIndex: 0 }));
  }

  /** Why the configuration cannot be edited here, or nothing when it can. */
  protected locked(config: CredentialConfig): string {
    const resource = this.managed().get(config.id);
    return resource ? lockReason(resource) : '';
  }

  protected hasIae(config: CredentialConfig): boolean {
    return !!config.iaeActions?.length;
  }

  protected errorMessage(error: unknown): string {
    return getApiErrorMessage(error, 'Failed to load the credential types');
  }
}
