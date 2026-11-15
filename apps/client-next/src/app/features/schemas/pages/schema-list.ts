import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideBraces,
  lucidePlugZap,
  lucideChevronRight,
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
import { dateTime } from '../../../shared/format/date-time';
import { relativeTime } from '../../../shared/format/relative-time';
import { PageHeader } from '../../../shared/pages/page-header';
import { groupSchemas, type SchemaGroup } from '../data/schema-display';
import { registrarConfigQuery } from '../../registrar/data/registrar-queries';
import { mySchemasQuery } from '../data/schema-queries';

const NO_GROUPS: SchemaGroup[] = [];

const COLUMNS: ColumnDef<ListFeatures, SchemaGroup>[] = [
  { id: 'name', accessorFn: (group) => group.name, sortFn: 'alphanumeric' },
  { id: 'versions', accessorFn: (group) => group.versions.length, sortFn: 'basic' },
  { id: 'issuer', accessorFn: (group) => group.issuer, sortFn: 'alphanumeric' },
  {
    id: 'updated',
    accessorFn: (group) => new Date(group.updatedAt).getTime(),
    sortFn: 'basic',
    sortDescFirst: true,
  },
];

/**
 * The schemas this tenant published at the registrar's catalog, one row per schema with its
 * versions: searchable, sorted by column and shown a page at a time. Publishing a new schema
 * needs `issuance:manage` besides `registrar:manage`, and the page says so.
 */
@Component({
  selector: 'app-schema-list',
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
      lucidePlugZap,
      lucideChevronRight,
      lucidePlus,
      lucideSearch,
      lucideTriangleAlert,
      lucideX,
    }),
  ],
  templateUrl: './schema-list.html',
})
export class SchemaList {
  private readonly instance = inject(SessionService).getBaseUrl();
  private readonly caller = inject(CallerService).loadedCaller;
  private readonly tenant = computed(() => this.caller()?.tenantId);

  /** The registrar connection; the schemas live there, so without one there is nothing to list. */
  private readonly registrar = injectQuery(() =>
    registrarConfigQuery(this.instance, this.tenant())
  );
  /** Whether the tenant has no registrar configured yet (the backend answers 404 then). */
  protected readonly notConfigured = computed(() => this.registrar.data() === null);
  protected readonly schemas = injectQuery(() =>
    mySchemasQuery(
      this.instance,
      this.tenant(),
      this.registrar.data() != null || this.registrar.isError()
    )
  );
  protected readonly groups = computed(() =>
    this.schemas.data() ? groupSchemas(this.schemas.data()!) : NO_GROUPS
  );
  /** Publishing needs `issuance:manage` besides `registrar:manage`. */
  protected readonly canPublish = computed(
    () => !!this.caller()?.roles.includes('issuance:manage')
  );

  protected readonly search = signal('');
  private readonly sorting = signal<SortingState>([{ id: 'updated', desc: true }]);
  private readonly pagination = signal<PaginationState>({ pageIndex: 0, pageSize: PAGE_SIZES[0] });

  protected readonly table = injectTable(() => ({
    features: listFeatures,
    columns: COLUMNS,
    data: this.groups(),
    getRowId: (group) => group.id,
    state: {
      globalFilter: this.search(),
      sorting: this.sorting(),
      pagination: this.pagination(),
    },
    globalFilterFn: searchIn<SchemaGroup>((group) => [group.id, group.name, group.issuer]),
    getColumnCanGlobalFilter: (column) => column.id === 'name',
    enableSortingRemoval: false,
    autoResetPageIndex: false,
    onSortingChange: (change) => {
      applyChange(this.sorting, change);
      this.toFirstPage();
    },
    onPaginationChange: (change) => applyChange(this.pagination, change),
  }));

  protected readonly versionCount = computed(() => this.schemas.data()?.length ?? 0);
  protected readonly matching = computed(() => this.table.getPrePaginatedRowModel().rows.length);

  protected readonly ariaSort = ariaSort;
  protected readonly dateTime = dateTime;
  protected readonly relativeTime = relativeTime;

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

  protected errorMessage(error: unknown): string {
    return getApiErrorMessage(error, 'Failed to load the schemas');
  }
}
