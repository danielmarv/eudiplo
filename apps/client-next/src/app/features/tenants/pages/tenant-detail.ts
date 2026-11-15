import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import type { ClientEntity, TenantResponseDto } from '@eudiplo/sdk-core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideArrowLeft,
  lucideCopy,
  lucideKeyRound,
  lucidePencil,
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
import { injectQuery, QueryClient } from '@tanstack/angular-query-experimental';
import {
  type ColumnDef,
  injectTable,
  type PaginationState,
  type SortingState,
} from '@tanstack/angular-table';
import { CallerService } from '../../../core/auth/caller.service';
import { canManageRoles } from '../../../core/auth/role-grants';
import { SessionService } from '../../../core/auth/session.service';
import { frontendConfigQuery, managesClients } from '../../../core/config/frontend-config';
import { getApiErrorMessage, hasHttpStatus } from '../../../core/errors/error-message';
import { NotifyService } from '../../../core/notify/notify.service';
import { Guilloche } from '../../../shared/brand/guilloche';
import { initialsOf, monogramSurface } from '../../../shared/brand/monogram';
import { copyText } from '../../../shared/clipboard/copy-text';
import { SortToggle } from '../../../shared/data-table/sort-toggle';
import {
  ariaSort,
  listFeatures,
  type ListFeatures,
  PAGE_SIZES,
  searchIn,
  type SortableColumn,
} from '../../../shared/data-table/table-features';
import { applyChange } from '../../../shared/data-table/table-state';
import { TablePagination } from '../../../shared/data-table/table-pagination';
import { ClientActions } from '../../clients/data/client-actions';
import { ClientSecretDialog } from '../components/client-secret-dialog';
import { DeleteTenantDialog } from '../components/delete-tenant-dialog';
import { RoleCoverage } from '../components/role-coverage';
import { SettingsCard } from '../components/settings-card';
import { tenantKey, tenantQuery } from '../data/tenant-queries';
import { keyChainSettings, sessionSettings, statusListSettings } from '../data/tenant-settings';

const NO_CLIENTS: ClientEntity[] = [];

const CLIENT_COLUMNS: ColumnDef<ListFeatures, ClientEntity>[] = [
  { id: 'clientId', accessorFn: (client) => client.clientId, sortFn: 'alphanumeric' },
  { id: 'description', accessorFn: (client) => client.description ?? '', enableSorting: false },
  {
    id: 'roles',
    accessorFn: (client) => client.roles.length,
    sortFn: 'basic',
    sortDescFirst: true,
  },
];

/**
 * One tenant: who it is and whether it was set up, its API clients and what they can do, and
 * its settings next to the instance defaults it falls back to. It can be edited or deleted
 * from here.
 */
@Component({
  selector: 'app-tenant-detail',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    NgIcon,
    HlmButtonImports,
    HlmInputGroupImports,
    HlmSkeletonImports,
    HlmTableImports,
    HlmTooltipImports,
    Guilloche,
    SortToggle,
    TablePagination,
    ClientSecretDialog,
    DeleteTenantDialog,
    RoleCoverage,
    SettingsCard,
  ],
  providers: [
    ClientActions,
    provideIcons({
      lucideArrowLeft,
      lucideCopy,
      lucideKeyRound,
      lucidePencil,
      lucideSearch,
      lucideTrash2,
      lucideTriangleAlert,
      lucideX,
    }),
  ],
  templateUrl: './tenant-detail.html',
})
export class TenantDetail {
  private readonly notify = inject(NotifyService);
  private readonly router = inject(Router);
  private readonly queryClient = inject(QueryClient);
  private readonly instance = inject(SessionService).getBaseUrl();

  /** The tenant's ID, from the route. */
  readonly id = input.required<string>();

  protected readonly tenant = injectQuery(() => tenantQuery(this.instance, this.id()));
  private readonly frontendConfig = injectQuery(() => frontendConfigQuery(this.instance));

  /** With another identity provider, that provider manages the clients; these are left over. */
  protected readonly providerManagesClients = computed(
    () => !managesClients(this.frontendConfig.data()?.authMode)
  );

  protected readonly clients = computed(() => this.tenant.data()?.clients ?? NO_CLIENTS);
  protected readonly clientActions = inject(ClientActions);
  private readonly caller = inject(CallerService).loadedCaller;
  private readonly callerRoles = computed(() => this.caller()?.roles ?? []);

  /** Why the caller cannot give `client` a new secret, or empty when it can. */
  protected secretLock(client: ClientEntity): string {
    return canManageRoles(this.callerRoles(), client.roles ?? [])
      ? ''
      : 'This client has roles you neither hold nor may grant.';
  }
  protected readonly settings = computed(() => {
    const tenant = this.tenant.data();
    return {
      sessions: tenant ? sessionSettings(tenant) : [],
      statusLists: tenant ? statusListSettings(tenant) : [],
      keyChains: tenant ? keyChainSettings(tenant) : [],
    };
  });

  protected readonly search = signal('');
  private readonly sorting = signal<SortingState>([{ id: 'clientId', desc: false }]);
  private readonly pagination = signal<PaginationState>({ pageIndex: 0, pageSize: PAGE_SIZES[0] });

  protected readonly table = injectTable(() => ({
    features: listFeatures,
    columns: CLIENT_COLUMNS,
    data: this.clients(),
    getRowId: (client) => client.clientId,
    state: {
      globalFilter: this.search(),
      sorting: this.sorting(),
      pagination: this.pagination(),
    },
    globalFilterFn: searchIn<ClientEntity>((client) => [
      client.clientId,
      client.description,
      ...client.roles,
    ]),
    getColumnCanGlobalFilter: (column) => column.id === 'clientId',
    enableSortingRemoval: false,
    autoResetPageIndex: false,
    onSortingChange: (change) => {
      applyChange(this.sorting, change);
      this.toFirstPage();
    },
    onPaginationChange: (change) => applyChange(this.pagination, change),
  }));

  protected readonly matching = computed(() => this.table.getPrePaginatedRowModel().rows.length);

  /** The tenant the confirmation asks about; the dialog is open while it is set. */
  protected readonly toDelete = signal<TenantResponseDto | null>(null);

  protected readonly ariaSort = ariaSort;

  constructor() {
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

  /** Lists the clients that hold `role`, or all of them again for an empty one. */
  protected showRole(role: string): void {
    this.search.set(role);
    this.toFirstPage();
  }

  private toFirstPage(): void {
    this.pagination.update((page) => ({ ...page, pageIndex: 0 }));
  }

  protected copyId(id: string): Promise<void> {
    return copyText(this.notify, id, 'Tenant ID');
  }

  protected async onDeleted(tenant: TenantResponseDto): Promise<void> {
    await this.router.navigate(['/tenants']);
    // Only now: while the page was open, removing it would have loaded the deleted tenant again.
    this.queryClient.removeQueries({ queryKey: tenantKey(this.instance, tenant.id), exact: true });
  }

  protected notFound(error: unknown): boolean {
    return hasHttpStatus(error, 404);
  }

  protected errorMessage(error: unknown): string {
    return getApiErrorMessage(error, 'Failed to load the tenant');
  }

  protected surface(id: string): string {
    return `relative overflow-hidden rounded-2xl text-white shadow-[0_18px_40px_-24px_rgba(16,24,64,0.6)] ${monogramSurface(id)}`;
  }

  protected initials(name: string): string {
    return initialsOf(name);
  }

  /** The roles of a client, each once: a client stored with a role twice still has it once. */
  protected rolesOf(client: ClientEntity): string[] {
    return [...new Set(client.roles)];
  }
}
