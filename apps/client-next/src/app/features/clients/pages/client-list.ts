import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import type { ClientEntity } from '@eudiplo/sdk-core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideBot,
  lucideChevronRight,
  lucideKeyRound,
  lucidePencil,
  lucidePlus,
  lucideSearch,
  lucideTrash2,
  lucideTriangleAlert,
  lucideX,
} from '@ng-icons/lucide';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import { HlmInputGroupImports } from '@spartan-ng/helm/input-group';
import { HlmSkeletonImports } from '@spartan-ng/helm/skeleton';
import { HlmSpinnerImports } from '@spartan-ng/helm/spinner';
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
import { canManageRoles } from '../../../core/auth/role-grants';
import { SessionService } from '../../../core/auth/session.service';
import {
  apiErrorDetail,
  getApiErrorMessage,
  hasHttpStatus,
} from '../../../core/errors/error-message';
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
import { ClientSecretDialog } from '../../tenants/components/client-secret-dialog';
import { ClientActions } from '../data/client-actions';
import { ROLE_LOCK, sortedRoles } from '../data/client-display';
import { clientsQuery } from '../data/client-queries';

const NO_CLIENTS: ClientEntity[] = [];
/** Roles a row shows before it sums up the rest. */
const SHOWN_ROLES = 3;

const COLUMNS: ColumnDef<ListFeatures, ClientEntity>[] = [
  { id: 'client', accessorFn: (client) => client.clientId, sortFn: 'alphanumeric' },
  { id: 'roles', accessorFn: (client) => client.roles?.length ?? 0, sortFn: 'basic' },
];

/**
 * The tenant's API clients (`/clients`): searchable, sorted and paged, each with its roles. A
 * client can be opened, edited, given a new secret or deleted, unless a file manages it or it has
 * roles the caller neither holds nor may grant. With another identity provider the backend
 * manages no clients, and the page says so.
 */
@Component({
  selector: 'app-client-list',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    NgIcon,
    HlmButtonImports,
    HlmInputGroupImports,
    HlmSkeletonImports,
    HlmSpinnerImports,
    HlmTableImports,
    HlmTooltipImports,
    ClientSecretDialog,
    PageHeader,
    SortToggle,
    TablePagination,
  ],
  providers: [
    ClientActions,
    provideIcons({
      lucideBot,
      lucideChevronRight,
      lucideKeyRound,
      lucidePencil,
      lucidePlus,
      lucideSearch,
      lucideTrash2,
      lucideTriangleAlert,
      lucideX,
    }),
  ],
  templateUrl: './client-list.html',
})
export class ClientList {
  private readonly instance = inject(SessionService).getBaseUrl();
  private readonly caller = inject(CallerService).loadedCaller;
  private readonly tenant = computed(() => this.caller()?.tenantId);
  protected readonly actions = inject(ClientActions);

  protected readonly clients = injectQuery(() => clientsQuery(this.instance, this.tenant()));
  private readonly ownership = injectQuery(() =>
    configOwnershipQuery(this.instance, this.tenant(), 'Client')
  );
  protected readonly list = computed(() => this.clients.data() ?? NO_CLIENTS);

  /** The message of a backend that manages no clients (501); empty otherwise. */
  protected readonly unavailable = computed(() => {
    const error = this.clients.error();
    return error && hasHttpStatus(error, 501)
      ? (apiErrorDetail(error) ?? 'This instance does not manage API clients.')
      : '';
  });

  protected readonly search = signal('');
  private readonly sorting = signal<SortingState>([{ id: 'client', desc: false }]);
  private readonly pagination = signal<PaginationState>({ pageIndex: 0, pageSize: PAGE_SIZES[0] });

  protected readonly table = injectTable(() => ({
    features: listFeatures,
    columns: COLUMNS,
    data: this.list(),
    getRowId: (client) => client.clientId,
    state: {
      globalFilter: this.search(),
      sorting: this.sorting(),
      pagination: this.pagination(),
    },
    globalFilterFn: searchIn<ClientEntity>((client) => [
      client.clientId,
      client.description ?? '',
      ...(client.roles ?? []),
    ]),
    getColumnCanGlobalFilter: (column) => column.id === 'client',
    enableSortingRemoval: false,
    autoResetPageIndex: false,
    onSortingChange: (change) => {
      applyChange(this.sorting, change);
      this.toFirstPage();
    },
    onPaginationChange: (change) => applyChange(this.pagination, change),
  }));

  protected readonly matching = computed(() => this.table.getPrePaginatedRowModel().rows.length);
  protected readonly ariaSort = ariaSort;
  protected readonly sortedRoles = sortedRoles;
  protected readonly shownRoles = SHOWN_ROLES;
  protected readonly roleLock = ROLE_LOCK;

  constructor() {
    effect(() => {
      const last = Math.max(0, this.table.getPageCount() - 1);
      if (this.pagination().pageIndex > last) {
        this.pagination.update((page) => ({ ...page, pageIndex: last }));
      }
    });
  }

  /** Why `client` cannot be changed here: a file manages it, or its roles; empty when it can. */
  protected lockOf(client: ClientEntity): string {
    const managed = fileManaged(this.ownership.data()).get(client.clientId);
    if (managed) return lockReason(managed);
    return canManageRoles(this.caller()?.roles ?? [], client.roles ?? []) ? '' : ROLE_LOCK;
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
    return getApiErrorMessage(error, 'Failed to load the API clients');
  }
}
