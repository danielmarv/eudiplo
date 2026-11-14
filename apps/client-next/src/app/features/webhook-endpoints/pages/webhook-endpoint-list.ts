import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import type { WebhookEndpointEntity } from '@eudiplo/sdk-core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideChevronRight,
  lucideWebhook,
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
import { authLabel, hostOf } from '../../../shared/api-key-endpoint/endpoint-display';
import { injectEndpointUsers } from '../data/endpoint-users';
import type { EndpointUser } from '../data/webhook-endpoint-display';
import { webhookEndpointsQuery } from '../data/webhook-endpoint-queries';

/** An endpoint with the configurations that use it; unknown while they load. */
interface Row {
  endpoint: WebhookEndpointEntity;
  usedBy?: EndpointUser[];
}

const NO_ROWS: Row[] = [];

const COLUMNS: ColumnDef<ListFeatures, Row>[] = [
  {
    id: 'name',
    accessorFn: ({ endpoint }) => endpoint.name || endpoint.id,
    sortFn: 'alphanumeric',
  },
  { id: 'url', accessorFn: ({ endpoint }) => hostOf(endpoint.url), sortFn: 'alphanumeric' },
  { id: 'auth', accessorFn: ({ endpoint }) => authLabel(endpoint), sortFn: 'text' },
  {
    id: 'users',
    accessorFn: (row) => row.usedBy?.length ?? 0,
    sortFn: 'basic',
    sortDescFirst: true,
  },
];

/**
 * The endpoints EUDIPLO notifies of presentation results and wallet unit revocations: searchable,
 * sorted by column and shown a page at a time. Each shows where it is called, how EUDIPLO
 * authenticates and which configurations use it, and opens or edits it. An endpoint a file
 * provisioned is read-only here, and says so.
 */
@Component({
  selector: 'app-webhook-endpoint-list',
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
      lucideWebhook,
      lucideKeyRound,
      lucideLock,
      lucidePencil,
      lucidePlus,
      lucideSearch,
      lucideTriangleAlert,
      lucideX,
    }),
  ],
  templateUrl: './webhook-endpoint-list.html',
})
export class WebhookEndpointList {
  private readonly instance = inject(SessionService).getBaseUrl();
  private readonly caller = inject(CallerService).loadedCaller;
  private readonly tenant = computed(() => this.caller()?.tenantId);

  protected readonly endpoints = injectQuery(() =>
    webhookEndpointsQuery(this.instance, this.tenant())
  );
  private readonly ownership = injectQuery(() =>
    configOwnershipQuery(this.instance, this.tenant(), 'WebhookEndpoint')
  );
  private readonly managed = computed(() => fileManaged(this.ownership.data()));
  private readonly endpointUsers = injectEndpointUsers();
  /** Whether the caller can read only one kind of configuration, so "used by" may be incomplete. */
  protected readonly usersPartial = this.endpointUsers.partial;
  protected readonly rows = computed<Row[]>(() => {
    const endpoints = this.endpoints.data();
    if (!endpoints) return NO_ROWS;
    const users = this.endpointUsers.users();
    return endpoints.map((endpoint) => ({
      endpoint,
      usedBy: users && (users.get(endpoint.id) ?? []),
    }));
  });

  protected readonly search = signal('');
  private readonly sorting = signal<SortingState>([{ id: 'name', desc: false }]);
  private readonly pagination = signal<PaginationState>({ pageIndex: 0, pageSize: PAGE_SIZES[0] });

  protected readonly table = injectTable(() => ({
    features: listFeatures,
    columns: COLUMNS,
    data: this.rows(),
    getRowId: (row) => row.endpoint.id,
    state: {
      globalFilter: this.search(),
      sorting: this.sorting(),
      pagination: this.pagination(),
    },
    globalFilterFn: searchIn<Row>(({ endpoint }) => [
      endpoint.id,
      endpoint.name,
      endpoint.url,
      endpoint.description,
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

  protected readonly total = computed(() => this.endpoints.data()?.length ?? 0);
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

  /** Why the endpoint cannot be edited here, or nothing when it can. */
  protected locked(endpoint: WebhookEndpointEntity): string {
    const managed = this.managed().get(endpoint.id);
    return managed ? lockReason(managed) : '';
  }

  protected errorMessage(error: unknown): string {
    return getApiErrorMessage(error, 'Failed to load the webhook endpoints');
  }
}
