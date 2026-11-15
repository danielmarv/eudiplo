import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideChevronDown,
  lucideCopy,
  lucideHistory,
  lucideRefreshCw,
  lucideSearch,
  lucideTriangleAlert,
  lucideX,
} from '@ng-icons/lucide';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import { HlmInputGroupImports } from '@spartan-ng/helm/input-group';
import { HlmNativeSelectImports } from '@spartan-ng/helm/native-select';
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
import { SessionService } from '../../../core/auth/session.service';
import { getApiErrorMessage } from '../../../core/errors/error-message';
import { NotifyService } from '../../../core/notify/notify.service';
import { copyText } from '../../../shared/clipboard/copy-text';
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
import {
  actionLabel,
  actionTone,
  actorOf,
  changesOf,
  objectTypes,
  parseAction,
} from '../data/activity-log-display';
import { ACTIVITY_LIMIT, type ActivityEntry, activityLogQuery } from '../data/activity-log-queries';

const NO_ENTRIES: ActivityEntry[] = [];

const COLUMNS: ColumnDef<ListFeatures, ActivityEntry>[] = [
  {
    id: 'time',
    accessorFn: (entry) => new Date(entry.timestamp).getTime(),
    sortFn: 'basic',
    sortDescFirst: true,
  },
  { id: 'action', accessorFn: (entry) => actionLabel(entry.actionType), sortFn: 'alphanumeric' },
  { id: 'actor', accessorFn: (entry) => actorOf(entry).name, sortFn: 'alphanumeric' },
];

/**
 * The tenant's configuration changes (`/admin/activity-logs`): who created, changed or deleted
 * what and when, newest first, filtered by the kind of object and searchable. An entry opens to
 * show the values of its changed fields before and after, and copies as JSON.
 */
@Component({
  selector: 'app-activity-log',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    NgIcon,
    HlmButtonImports,
    HlmInputGroupImports,
    HlmNativeSelectImports,
    HlmSkeletonImports,
    HlmSpinnerImports,
    HlmTableImports,
    HlmTooltipImports,
    PageHeader,
    SortToggle,
    TablePagination,
  ],
  providers: [
    provideIcons({
      lucideChevronDown,
      lucideCopy,
      lucideHistory,
      lucideRefreshCw,
      lucideSearch,
      lucideTriangleAlert,
      lucideX,
    }),
  ],
  templateUrl: './activity-log.html',
})
export class ActivityLog {
  private readonly instance = inject(SessionService).getBaseUrl();
  private readonly caller = inject(CallerService).loadedCaller;
  private readonly tenant = computed(() => this.caller()?.tenantId);
  private readonly notify = inject(NotifyService);

  protected readonly log = injectQuery(() => activityLogQuery(this.instance, this.tenant()));
  protected readonly entries = computed(() => this.log.data() ?? NO_ENTRIES);
  protected readonly objectTypes = computed(() => objectTypes(this.entries()));
  /** Whether the backend returned as many entries as it returns at most, so older ones exist. */
  protected readonly capped = computed(() => this.entries().length >= ACTIVITY_LIMIT);

  protected readonly objectType = signal('');
  protected readonly search = signal('');
  protected readonly expanded = signal<string | null>(null);
  private readonly sorting = signal<SortingState>([{ id: 'time', desc: true }]);
  private readonly pagination = signal<PaginationState>({ pageIndex: 0, pageSize: PAGE_SIZES[1] });

  /** The entries of the chosen kind of object; the search filters them further. */
  private readonly ofType = computed(() => {
    const type = this.objectType();
    return type
      ? this.entries().filter((entry) => parseAction(entry.actionType).object === type)
      : this.entries();
  });

  protected readonly table = injectTable(() => ({
    features: listFeatures,
    columns: COLUMNS,
    data: this.ofType(),
    getRowId: (entry) => entry.id,
    state: {
      globalFilter: this.search(),
      sorting: this.sorting(),
      pagination: this.pagination(),
    },
    globalFilterFn: searchIn<ActivityEntry>((entry) => [
      actionLabel(entry.actionType),
      entry.actorDisplay ?? '',
      entry.actorId ?? '',
      ...(entry.changedFields ?? []),
      entry.requestId ?? '',
    ]),
    getColumnCanGlobalFilter: (column) => column.id === 'action',
    enableSortingRemoval: false,
    autoResetPageIndex: false,
    onSortingChange: (change) => {
      applyChange(this.sorting, change);
      this.toFirstPage();
    },
    onPaginationChange: (change) => applyChange(this.pagination, change),
  }));

  protected readonly matching = computed(() => this.table.getPrePaginatedRowModel().rows.length);
  protected readonly filtered = computed(() => !!this.search() || !!this.objectType());

  protected readonly ariaSort = ariaSort;
  protected readonly dateTime = dateTime;
  protected readonly relativeTime = relativeTime;
  protected readonly actionLabel = actionLabel;
  protected readonly actionTone = actionTone;
  protected readonly actorOf = actorOf;
  protected readonly changesOf = changesOf;

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

  protected onObjectType(value: string): void {
    this.objectType.set(value);
    this.toFirstPage();
  }

  protected clearFilters(): void {
    this.search.set('');
    this.objectType.set('');
    this.toFirstPage();
  }

  protected toggle(id: string): void {
    this.expanded.update((open) => (open === id ? null : id));
  }

  protected copy(entry: ActivityEntry): void {
    void copyText(this.notify, JSON.stringify(entry, null, 2), 'Entry');
  }

  protected refresh(): void {
    void this.log.refetch();
  }

  private toFirstPage(): void {
    this.pagination.update((page) => ({ ...page, pageIndex: 0 }));
  }

  protected errorMessage(error: unknown): string {
    return getApiErrorMessage(error, 'Failed to load the activity log');
  }
}
