import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import type { AttributeProviderEntity } from '@eudiplo/sdk-core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideChevronRight,
  lucideDatabaseZap,
  lucideKeyRound,
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
import {
  attributeProvidersQuery,
  credentialConfigsQuery,
} from '../../issuance/data/issuance-queries';
import { authLabel, hostOf } from '../../../shared/api-key-endpoint/endpoint-display';
import { usersByProvider } from '../data/attribute-provider-display';

/** A provider with the IDs of the credential types that use it; unknown while they load. */
interface Row {
  provider: AttributeProviderEntity;
  usedBy?: string[];
}

const NO_ROWS: Row[] = [];

const COLUMNS: ColumnDef<ListFeatures, Row>[] = [
  {
    id: 'name',
    accessorFn: ({ provider }) => provider.name || provider.id,
    sortFn: 'alphanumeric',
  },
  { id: 'url', accessorFn: ({ provider }) => hostOf(provider.url), sortFn: 'alphanumeric' },
  { id: 'auth', accessorFn: ({ provider }) => authLabel(provider), sortFn: 'text' },
  {
    id: 'users',
    accessorFn: (row) => row.usedBy?.length ?? 0,
    sortFn: 'basic',
    sortDescFirst: true,
  },
];

/**
 * The services EUDIPLO asks for the claims of a credential while a wallet fetches it: searchable,
 * sorted by column and shown a page at a time. Each shows where it is called, how EUDIPLO
 * authenticates and which credential types use it, and opens or edits it. A provider a file
 * provisioned is read-only here, and says so.
 */
@Component({
  selector: 'app-attribute-provider-list',
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
      lucideChevronRight,
      lucideDatabaseZap,
      lucideKeyRound,
      lucideLock,
      lucidePencil,
      lucidePlus,
      lucideSearch,
      lucideTriangleAlert,
      lucideX,
    }),
  ],
  templateUrl: './attribute-provider-list.html',
})
export class AttributeProviderList {
  private readonly instance = inject(SessionService).getBaseUrl();
  private readonly caller = inject(CallerService).loadedCaller;
  private readonly tenant = computed(() => this.caller()?.tenantId);

  protected readonly providers = injectQuery(() =>
    attributeProvidersQuery(this.instance, this.tenant())
  );
  private readonly configs = injectQuery(() =>
    credentialConfigsQuery(this.instance, this.tenant())
  );
  private readonly ownership = injectQuery(() =>
    configOwnershipQuery(this.instance, this.tenant(), 'AttributeProvider')
  );
  private readonly managed = computed(() => fileManaged(this.ownership.data()));
  protected readonly rows = computed<Row[]>(() => {
    const providers = this.providers.data();
    if (!providers) return NO_ROWS;
    // Unknown while the credential types load, or when they could not be loaded.
    const users = this.configs.isSuccess() ? usersByProvider(this.configs.data()) : undefined;
    return providers.map((provider) => ({
      provider,
      usedBy: users && (users.get(provider.id) ?? []).map((config) => config.id),
    }));
  });

  protected readonly search = signal('');
  private readonly sorting = signal<SortingState>([{ id: 'name', desc: false }]);
  private readonly pagination = signal<PaginationState>({ pageIndex: 0, pageSize: PAGE_SIZES[0] });

  protected readonly table = injectTable(() => ({
    features: listFeatures,
    columns: COLUMNS,
    data: this.rows(),
    getRowId: (row) => row.provider.id,
    state: {
      globalFilter: this.search(),
      sorting: this.sorting(),
      pagination: this.pagination(),
    },
    globalFilterFn: searchIn<Row>(({ provider }) => [
      provider.id,
      provider.name,
      provider.url,
      provider.description,
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

  protected readonly total = computed(() => this.providers.data()?.length ?? 0);
  protected readonly matching = computed(() => this.table.getPrePaginatedRowModel().rows.length);

  protected readonly ariaSort = ariaSort;
  protected readonly authLabel = authLabel;
  protected readonly hostOf = hostOf;

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

  protected clearSearch(): void {
    this.search.set('');
    this.toFirstPage();
  }

  private toFirstPage(): void {
    this.pagination.update((page) => ({ ...page, pageIndex: 0 }));
  }

  /** Why the provider cannot be edited here, or nothing when it can. */
  protected locked(provider: AttributeProviderEntity): string {
    const managed = this.managed().get(provider.id);
    return managed ? lockReason(managed) : '';
  }

  protected errorMessage(error: unknown): string {
    return getApiErrorMessage(error, 'Failed to load the attribute providers');
  }
}
