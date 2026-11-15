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
  lucideChevronRight,
  lucidePencil,
  lucideSearch,
  lucideTrash2,
  lucideTriangleAlert,
  lucideUserPlus,
  lucideUserRound,
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
import { canManageRoles } from '../../../core/auth/role-grants';
import { SessionService } from '../../../core/auth/session.service';
import {
  apiErrorDetail,
  getApiErrorMessage,
  hasHttpStatus,
} from '../../../core/errors/error-message';
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
import { sortedRoles } from '../../clients/data/client-display';
import { UserActions, USER_ROLE_LOCK } from '../data/user-actions';
import { type User, usersQuery } from '../data/user-queries';

const NO_USERS: User[] = [];
/** Roles a row shows before it sums up the rest. */
const SHOWN_ROLES = 3;

const COLUMNS: ColumnDef<ListFeatures, User>[] = [
  { id: 'user', accessorFn: (user) => user.username, sortFn: 'alphanumeric' },
  { id: 'status', accessorFn: (user) => (user.enabled ? 0 : 1), sortFn: 'basic' },
  { id: 'roles', accessorFn: (user) => user.roles?.length ?? 0, sortFn: 'basic' },
];

/**
 * The tenant's people (`/users`), whom the identity provider signs in: searchable, sorted and
 * paged, each with its status and roles. A person can be opened, edited or deleted, unless they
 * have roles the caller neither holds nor may grant. Without Keycloak the backend manages no
 * people, and the page says so.
 */
@Component({
  selector: 'app-user-list',
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
    UserActions,
    provideIcons({
      lucideChevronRight,
      lucidePencil,
      lucideSearch,
      lucideTrash2,
      lucideTriangleAlert,
      lucideUserPlus,
      lucideUserRound,
      lucideX,
    }),
  ],
  templateUrl: './user-list.html',
})
export class UserList {
  private readonly instance = inject(SessionService).getBaseUrl();
  private readonly caller = inject(CallerService).loadedCaller;
  private readonly tenant = computed(() => this.caller()?.tenantId);
  protected readonly actions = inject(UserActions);

  protected readonly users = injectQuery(() => usersQuery(this.instance, this.tenant()));
  protected readonly list = computed(() => this.users.data() ?? NO_USERS);

  /** The message of a backend that manages no people (501); empty otherwise. */
  protected readonly unavailable = computed(() => {
    const error = this.users.error();
    return error && hasHttpStatus(error, 501)
      ? (apiErrorDetail(error) ?? 'This instance does not manage people.')
      : '';
  });

  protected readonly search = signal('');
  private readonly sorting = signal<SortingState>([{ id: 'user', desc: false }]);
  private readonly pagination = signal<PaginationState>({ pageIndex: 0, pageSize: PAGE_SIZES[0] });

  protected readonly table = injectTable(() => ({
    features: listFeatures,
    columns: COLUMNS,
    data: this.list(),
    getRowId: (user) => user.id,
    state: {
      globalFilter: this.search(),
      sorting: this.sorting(),
      pagination: this.pagination(),
    },
    globalFilterFn: searchIn<User>((user) => [
      user.username,
      user.email ?? '',
      ...(user.roles ?? []),
    ]),
    getColumnCanGlobalFilter: (column) => column.id === 'user',
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

  constructor() {
    effect(() => {
      const last = Math.max(0, this.table.getPageCount() - 1);
      if (this.pagination().pageIndex > last) {
        this.pagination.update((page) => ({ ...page, pageIndex: last }));
      }
    });
  }

  /** Why `user` cannot be changed here; empty when it can. */
  protected lockOf(user: User): string {
    return canManageRoles(this.caller()?.roles ?? [], user.roles ?? []) ? '' : USER_ROLE_LOCK;
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
    return getApiErrorMessage(error, 'Failed to load the people');
  }
}
