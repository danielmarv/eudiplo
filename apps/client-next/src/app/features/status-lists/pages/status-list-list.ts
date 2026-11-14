import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import type { StatusListResponseDto } from '@eudiplo/sdk-core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideChevronRight,
  lucideCircleCheck,
  lucideCircleDashed,
  lucideClock,
  lucideCopy,
  lucideListChecks,
  lucideLock,
  lucidePlus,
  lucideRefreshCw,
  lucideSearch,
  lucideSettings2,
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
import { CallerService } from '../../../core/auth/caller.service';
import { SessionService } from '../../../core/auth/session.service';
import { getApiErrorMessage } from '../../../core/errors/error-message';
import { NotifyService } from '../../../core/notify/notify.service';
import { copyText } from '../../../shared/clipboard/copy-text';
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
import { dateTime } from '../../../shared/format/date-time';
import { PageHeader } from '../../../shared/pages/page-header';
import { DeleteStatusListDialog } from '../components/delete-status-list-dialog';
import { UsageMeter } from '../components/usage-meter';
import { TOKEN_STATES, tokenState, usagePercent } from '../data/status-list-display';
import { statusListsQuery } from '../data/status-list-queries';

const NO_LISTS: StatusListResponseDto[] = [];

const COLUMNS: ColumnDef<ListFeatures, StatusListResponseDto>[] = [
  { id: 'id', accessorFn: (list) => list.id, sortFn: 'alphanumeric' },
  {
    id: 'credential',
    accessorFn: (list) => list.credentialConfigurationId ?? '',
    sortFn: 'alphanumeric',
  },
  { id: 'keyChain', accessorFn: (list) => list.keyChainId ?? '', sortFn: 'alphanumeric' },
  { id: 'bits', accessorFn: (list) => list.bits, sortFn: 'basic' },
  { id: 'usage', accessorFn: usagePercent, sortFn: 'basic', sortDescFirst: true },
  {
    id: 'token',
    // Not signed yet sorts first, as the soonest to need signing.
    accessorFn: (list) => (list.expiresAt ? new Date(list.expiresAt).getTime() : 0),
    sortFn: 'basic',
  },
];

/**
 * The tenant's status lists, through which relying parties check whether a credential was
 * revoked or suspended: searchable, sorted by column and shown a page at a time. Each shows what
 * it serves, how full it is and whether its signed copy is current, and links to its page. A list
 * no credential uses can be deleted; a list a file provisioned is read-only here.
 */
@Component({
  selector: 'app-status-list-list',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    NgIcon,
    HlmButtonImports,
    HlmInputGroupImports,
    HlmSkeletonImports,
    HlmTableImports,
    HlmTooltipImports,
    DeleteStatusListDialog,
    PageHeader,
    SortToggle,
    TablePagination,
    UsageMeter,
  ],
  providers: [
    provideIcons({
      lucideChevronRight,
      lucideCircleCheck,
      lucideCircleDashed,
      lucideClock,
      lucideCopy,
      lucideListChecks,
      lucideLock,
      lucidePlus,
      lucideRefreshCw,
      lucideSearch,
      lucideSettings2,
      lucideTrash2,
      lucideTriangleAlert,
      lucideX,
    }),
  ],
  templateUrl: './status-list-list.html',
})
export class StatusListList {
  private readonly instance = inject(SessionService).getBaseUrl();
  private readonly caller = inject(CallerService).loadedCaller;
  private readonly tenant = computed(() => this.caller()?.tenantId);
  private readonly notify = inject(NotifyService);

  protected readonly lists = injectQuery(() => statusListsQuery(this.instance, this.tenant()));
  private readonly ownership = injectQuery(() =>
    configOwnershipQuery(this.instance, this.tenant(), 'StatusList')
  );
  private readonly managed = computed(() => fileManaged(this.ownership.data()));

  protected readonly search = signal('');
  private readonly sorting = signal<SortingState>([{ id: 'id', desc: false }]);
  private readonly pagination = signal<PaginationState>({ pageIndex: 0, pageSize: PAGE_SIZES[0] });
  /** The list the delete dialog asks about. */
  protected readonly toDelete = signal<StatusListResponseDto | null>(null);

  protected readonly table = injectTable(() => ({
    features: listFeatures,
    columns: COLUMNS,
    data: this.lists.data() ?? NO_LISTS,
    getRowId: (list) => list.id,
    state: {
      globalFilter: this.search(),
      sorting: this.sorting(),
      pagination: this.pagination(),
    },
    globalFilterFn: searchIn<StatusListResponseDto>((list) => [
      list.id,
      list.credentialConfigurationId,
      list.keyChainId,
    ]),
    getColumnCanGlobalFilter: (column) => column.id === 'id',
    enableSortingRemoval: false,
    autoResetPageIndex: false,
    onSortingChange: (change) => {
      applyChange(this.sorting, change);
      this.toFirstPage();
    },
    onPaginationChange: (change) => applyChange(this.pagination, change),
  }));

  protected readonly total = computed(() => this.lists.data()?.length ?? 0);
  protected readonly matching = computed(() => this.table.getPrePaginatedRowModel().rows.length);
  /** The credentials the lists hold, of the entries they have. */
  protected readonly entries = computed(() =>
    (this.lists.data() ?? NO_LISTS).reduce(
      (sum, list) => ({
        used: sum.used + list.usedEntries,
        capacity: sum.capacity + list.capacity,
      }),
      { used: 0, capacity: 0 }
    )
  );

  protected readonly ariaSort = ariaSort;
  protected readonly tokenStates = TOKEN_STATES;
  protected readonly tokenState = tokenState;
  protected readonly dateTime = dateTime;

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

  /** Why the list cannot be deleted, or nothing when it can. */
  protected undeletable(list: StatusListResponseDto): string {
    const managed = this.managed().get(list.id);
    if (managed) return lockReason(managed);
    if (list.usedEntries > 0) return 'Credentials use it, so it cannot be deleted';
    return '';
  }

  protected isManaged(list: StatusListResponseDto): string {
    const managed = this.managed().get(list.id);
    return managed ? lockReason(managed) : '';
  }

  protected tokenTitle(list: StatusListResponseDto): string {
    const state = tokenState(list);
    const detail = TOKEN_STATES[state].detail;
    return list.expiresAt && state !== 'none'
      ? `${state === 'expired' ? 'Expired' : 'Expires'} ${dateTime(list.expiresAt)}. ${detail}`
      : detail;
  }

  protected copyUri(list: StatusListResponseDto): void {
    void copyText(this.notify, list.uri, 'Status list address');
  }

  protected errorMessage(error: unknown): string {
    return getApiErrorMessage(error, 'Failed to load the status lists');
  }
}
