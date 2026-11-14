import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import type { TenantResponseDto } from '@eudiplo/sdk-core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideBuilding2,
  lucideChevronRight,
  lucidePlus,
  lucideSearch,
  lucideTrash2,
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
import { SessionService } from '../../../core/auth/session.service';
import { getApiErrorMessage } from '../../../core/errors/error-message';
import { initialsOf, monogramGradient } from '../../../shared/brand/monogram';
import { SortToggle } from '../../../shared/data-table/sort-toggle';
import {
  ariaSort,
  type SortableColumn,
  listFeatures,
  type ListFeatures,
  PAGE_SIZES,
  searchIn,
} from '../../../shared/data-table/table-features';
import { applyChange } from '../../../shared/data-table/table-state';
import { TablePagination } from '../../../shared/data-table/table-pagination';
import { PageHeader } from '../../../shared/pages/page-header';
import { DeleteTenantDialog } from '../components/delete-tenant-dialog';
import { tenantsQuery } from '../data/tenant-queries';

/** Which tenants the status filter shows. */
type StatusFilter = 'all' | 'active' | 'pending';

/** Whether a tenant was set up: `null` when creating its encryption key failed. */
function statusOf(tenant: TenantResponseDto): Exclude<StatusFilter, 'all'> {
  return tenant.status === 'active' ? 'active' : 'pending';
}

const NO_TENANTS: TenantResponseDto[] = [];

const COLUMNS: ColumnDef<ListFeatures, TenantResponseDto>[] = [
  { id: 'name', accessorFn: (tenant) => tenant.name || tenant.id, sortFn: 'alphanumeric' },
  { id: 'description', accessorFn: (tenant) => tenant.description ?? '', enableSorting: false },
  {
    id: 'clients',
    accessorFn: (tenant) => tenant.clients?.length ?? 0,
    sortFn: 'basic',
    sortDescFirst: true,
  },
  { id: 'status', accessorFn: statusOf, sortFn: 'text', filterFn: 'equalsString' },
];

/**
 * The tenants of the instance: the organizations that issue or verify credentials, each with
 * its own clients, keys and configuration. The list can be searched by name, ID and
 * description, filtered by status, sorted by column, and is shown a page at a time. A tenant
 * is deleted after a confirmation that names it.
 */
@Component({
  selector: 'app-tenant-list',
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
    DeleteTenantDialog,
  ],
  providers: [
    provideIcons({
      lucideBuilding2,
      lucideChevronRight,
      lucidePlus,
      lucideSearch,
      lucideTrash2,
      lucideTriangleAlert,
      lucideX,
    }),
  ],
  templateUrl: './tenant-list.html',
})
export class TenantList {
  private readonly instance = inject(SessionService).getBaseUrl();

  protected readonly tenants = injectQuery(() => tenantsQuery(this.instance));

  protected readonly search = signal('');
  protected readonly status = signal<StatusFilter>('all');
  private readonly sorting = signal<SortingState>([{ id: 'name', desc: false }]);
  private readonly pagination = signal<PaginationState>({ pageIndex: 0, pageSize: PAGE_SIZES[0] });

  protected readonly table = injectTable(() => ({
    features: listFeatures,
    columns: COLUMNS,
    data: this.tenants.data() ?? NO_TENANTS,
    getRowId: (tenant) => tenant.id,
    state: {
      globalFilter: this.search(),
      columnFilters: this.status() === 'all' ? [] : [{ id: 'status', value: this.status() }],
      sorting: this.sorting(),
      pagination: this.pagination(),
    },
    globalFilterFn: searchIn<TenantResponseDto>((tenant) => [
      tenant.name,
      tenant.id,
      tenant.description,
    ]),
    // The search reads the row, not a column, so one column runs it.
    getColumnCanGlobalFilter: (column) => column.id === 'name',
    enableSortingRemoval: false,
    // A deletion or a reload keeps the page; a new search or order starts at the first one.
    autoResetPageIndex: false,
    onSortingChange: (change) => {
      applyChange(this.sorting, change);
      this.toFirstPage();
    },
    onPaginationChange: (change) => applyChange(this.pagination, change),
  }));

  /** How many tenants the instance has, by status, whatever the search shows. */
  protected readonly counts = computed(() => {
    const all = this.tenants.data() ?? NO_TENANTS;
    const active = all.filter((tenant) => statusOf(tenant) === 'active').length;
    return { all: all.length, active, pending: all.length - active };
  });

  /** How many tenants match the search and the status filter, on every page. */
  protected readonly matching = computed(() => this.table.getPrePaginatedRowModel().rows.length);

  /** Whether the instance reports the clients of its tenants, so the column has something to show. */
  protected readonly showsClients = computed(() =>
    (this.tenants.data() ?? NO_TENANTS).some((tenant) => tenant.clients)
  );

  protected readonly filters: readonly { value: StatusFilter; label: string }[] = [
    { value: 'all', label: 'All' },
    { value: 'active', label: 'Active' },
    { value: 'pending', label: 'Not set up' },
  ];

  /** The tenant the confirmation asks about; the dialog is open while it is set. */
  protected readonly toDelete = signal<TenantResponseDto | null>(null);

  protected readonly ariaSort = ariaSort;

  constructor() {
    // After a deletion empties the last page, show the page before it.
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

  protected clearFilters(): void {
    this.search.set('');
    this.status.set('all');
    this.toFirstPage();
  }

  protected filterBy(status: StatusFilter): void {
    this.status.set(status);
    this.toFirstPage();
  }

  protected count(status: StatusFilter): number {
    return this.counts()[status];
  }

  private toFirstPage(): void {
    this.pagination.update((page) => ({ ...page, pageIndex: 0 }));
  }

  protected isActive(tenant: TenantResponseDto): boolean {
    return statusOf(tenant) === 'active';
  }

  /** Why the list could not be loaded, with the backend's reason when it gives one. */
  protected errorMessage(error: unknown): string {
    return getApiErrorMessage(error, 'Failed to load the tenants');
  }

  protected monogram(id: string): string {
    return `grid size-9 shrink-0 place-items-center rounded-xl text-[0.7rem] font-bold text-white ${monogramGradient(id)}`;
  }

  protected initials(name: string): string {
    return initialsOf(name);
  }
}
