import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  ElementRef,
  HostListener,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import {
  type ColumnDef,
  injectTable,
  type PaginationState,
  type SortingState,
} from '@tanstack/angular-table';
import { debounceTime, skip } from 'rxjs';
import type { Session } from '@eudiplo/sdk-core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideActivity,
  lucideCircleX,
  lucideChevronDown,
  lucideFilterX,
  lucidePlus,
  lucideRefreshCw,
  lucideSearch,
  lucideSettings2,
  lucideTrash2,
  lucideTriangleAlert,
  lucideX,
} from '@ng-icons/lucide';
import { HlmAlertDialogImports } from '@spartan-ng/helm/alert-dialog';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import { HlmInputImports } from '@spartan-ng/helm/input';
import { HlmSkeletonImports } from '@spartan-ng/helm/skeleton';
import { HlmSpinnerImports } from '@spartan-ng/helm/spinner';
import { HlmTableImports } from '@spartan-ng/helm/table';
import { injectMutation, injectQuery, QueryClient } from '@tanstack/angular-query-experimental';
import { CallerService } from '../../../core/auth/caller.service';
import { SessionService } from '../../../core/auth/session.service';
import { hasHttpStatus, getApiErrorMessage } from '../../../core/errors/error-message';
import { NotifyService } from '../../../core/notify/notify.service';
import { SortToggle } from '../../../shared/data-table/sort-toggle';
import {
  ariaSort,
  listFeatures,
  type ListFeatures,
  type SortableColumn,
} from '../../../shared/data-table/table-features';
import { TablePagination } from '../../../shared/data-table/table-pagination';
import { dateTime } from '../../../shared/format/date-time';
import { PageHeader } from '../../../shared/pages/page-header';
import {
  SESSION_PAGE_SIZES,
  sessionListStateFromParams,
  sessionListUrlParams,
  type SessionListState,
  type SessionSortField,
  type SessionStatus,
  type SessionType,
  type UpdatedFilter,
} from '../data/session-list-state';
import {
  cancelSessionMutation,
  deleteSessionMutation,
  sessionConfigOptionsQuery,
  sessionsQuery,
} from '../data/session-queries';

const NO_SESSIONS: Session[] = [];
const STATUSES: { value: SessionStatus; label: string }[] = [
  { value: 'active', label: 'Active' },
  { value: 'fetched', label: 'Fetched' },
  { value: 'completed', label: 'Completed' },
  { value: 'expired', label: 'Expired' },
  { value: 'failed', label: 'Failed' },
  { value: 'cancelled', label: 'Cancelled' },
];
const UPDATED_OPTIONS: { value: Exclude<UpdatedFilter, '' | 'custom'>; label: string }[] = [
  { value: '15m', label: 'Last 15 minutes' },
  { value: '1h', label: 'Last hour' },
  { value: '24h', label: 'Last 24 hours' },
  { value: '7d', label: 'Last 7 days' },
];
const FAILURE_CODES = [
  'access_denied',
  'certificate_expired',
  'credential_deleted',
  'credential_failure',
  'no_trust_chain_to_root',
  'signature_invalid',
  'trust_chain_not_trusted',
  'trust_list_unavailable',
  'verification_error',
  'x5c_missing',
];

const COLUMNS: ColumnDef<ListFeatures, Session>[] = [
  { id: 'id', accessorFn: (session) => session.id, sortFn: 'alphanumeric' },
  {
    id: 'type',
    accessorFn: (session) => (session.requestId ? 'presentation' : 'issuance'),
    sortFn: 'text',
  },
  { id: 'status', accessorFn: (session) => session.status, sortFn: 'text' },
  { id: 'createdAt', accessorFn: (session) => session.createdAt, sortFn: 'basic' },
  { id: 'updatedAt', accessorFn: (session) => session.updatedAt, sortFn: 'basic' },
];

const PENDING_STATUSES: SessionStatus[] = ['active', 'fetched'];

function isPresentationSession(session: Pick<Session, 'requestId'>): boolean {
  return !!session.requestId;
}

function isCancellable(session: Pick<Session, 'status' | 'consumed'>): boolean {
  return (session.status === 'active' || session.status === 'fetched') && !session.consumed;
}

function canChangeSession(roles: readonly string[], session: Pick<Session, 'requestId'>): boolean {
  const canCancelAtAll = roles.includes('issuance:offer') || roles.includes('presentation:request');
  const canManageSide = isPresentationSession(session)
    ? roles.includes('presentation:request') || roles.includes('presentation:manage')
    : roles.includes('issuance:offer') || roles.includes('issuance:manage');
  return canCancelAtAll && canManageSide;
}

function isCancelConflict(error: unknown): boolean {
  return hasHttpStatus(error, 409);
}

@Component({
  selector: 'app-session-list',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    RouterLink,
    NgIcon,
    HlmAlertDialogImports,
    HlmButtonImports,
    HlmInputImports,
    HlmSkeletonImports,
    HlmSpinnerImports,
    HlmTableImports,
    SortToggle,
    TablePagination,
    PageHeader,
  ],
  providers: [
    provideIcons({
      lucideActivity,
      lucideCircleX,
      lucideChevronDown,
      lucideFilterX,
      lucidePlus,
      lucideRefreshCw,
      lucideSearch,
      lucideSettings2,
      lucideTrash2,
      lucideTriangleAlert,
      lucideX,
    }),
  ],
  templateUrl: './session-list.html',
})
export class SessionList {
  private readonly instance = inject(SessionService).getBaseUrl();
  private readonly caller = inject(CallerService).loadedCaller;
  private readonly tenant = computed(() => this.caller()?.tenantId);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly queryClient = inject(QueryClient);
  private readonly notify = inject(NotifyService);
  private readonly statusDropdown = viewChild<ElementRef<HTMLDetailsElement>>('statusDropdown');

  protected readonly state = signal<SessionListState>(
    sessionListStateFromParams(this.route.snapshot.queryParamMap)
  );
  protected readonly filters = new FormGroup({
    q: new FormControl(this.state().q, { nonNullable: true }),
    type: new FormControl<SessionType | ''>(this.state().type, { nonNullable: true }),
    status: new FormControl<SessionStatus[]>(this.state().status, { nonNullable: true }),
    config: new FormControl(this.state().config, { nonNullable: true }),
    createdFrom: new FormControl(this.state().createdFrom, { nonNullable: true }),
    createdTo: new FormControl(this.state().createdTo, { nonNullable: true }),
    updated: new FormControl<UpdatedFilter>(this.state().updated, { nonNullable: true }),
    updatedFrom: new FormControl(this.state().updatedFrom, { nonNullable: true }),
    updatedTo: new FormControl(this.state().updatedTo, { nonNullable: true }),
    failureCode: new FormControl(this.state().failureCode, { nonNullable: true }),
  });
  protected readonly filterError = signal('');
  private readonly filterVersion = signal(0);
  private readonly sorting = signal<SortingState>(this.sortingFor(this.state()));
  protected readonly selectedIds = signal<string[]>([]);
  protected readonly confirmingCancel = signal(false);
  protected readonly confirmingDelete = signal(false);
  protected readonly cancelForm = new FormGroup({
    reason: new FormControl('', {
      nonNullable: true,
      validators: [Validators.maxLength(500)],
    }),
  });
  protected readonly actionBusy = signal(false);
  protected readonly isPresentationSession = isPresentationSession;
  protected readonly isCancellable = isCancellable;
  protected readonly ariaSort = ariaSort;
  protected readonly statuses = STATUSES;
  protected readonly updatedOptions = UPDATED_OPTIONS;
  protected readonly failureCodes = FAILURE_CODES;
  protected readonly pageSizes = SESSION_PAGE_SIZES;
  protected readonly dateTime = dateTime;

  protected readonly sessions = injectQuery(() =>
    sessionsQuery(this.instance, this.tenant(), this.state())
  );
  private readonly credentialConfigs = injectQuery(() =>
    sessionConfigOptionsQuery(
      this.instance,
      this.tenant(),
      'issuance',
      this.hasRole('issuance:manage')
    )
  );
  private readonly presentationConfigs = injectQuery(() =>
    sessionConfigOptionsQuery(
      this.instance,
      this.tenant(),
      'presentation',
      this.hasRole('presentation:manage')
    )
  );
  private readonly cancelMutation = injectMutation(() => cancelSessionMutation());
  private readonly deleteMutation = injectMutation(() => deleteSessionMutation());

  protected readonly configSuggestions = computed(() => [
    ...(this.credentialConfigs.data() ?? []).map((config) => ({
      value: `issuance:${config.id}`,
      label: `Issuance: ${config.id}`,
    })),
    ...(this.presentationConfigs.data() ?? []).map((config) => ({
      value: `presentation:${config.id}`,
      label: `Presentation: ${config.id}`,
    })),
  ]);
  protected readonly configOptionsError = computed(
    () => this.credentialConfigs.isError() || this.presentationConfigs.isError()
  );
  protected readonly table = injectTable(() => ({
    features: listFeatures,
    columns: COLUMNS,
    data: this.sessions.data()?.items ?? NO_SESSIONS,
    getRowId: (session) => session.id,
    state: {
      sorting: this.sorting(),
      pagination: this.paginationState(),
    },
    manualSorting: true,
    manualPagination: true,
    pageCount: this.sessions.data()?.totalPages ?? 1,
    enableSortingRemoval: false,
    autoResetPageIndex: false,
    onSortingChange: (change) => {
      this.sorting.update((last) => (typeof change === 'function' ? change(last) : change));
      const sorted = this.sorting()[0];
      this.updateState({
        page: 1,
        sortBy: sorted ? this.sortField(sorted.id) : '',
        sortOrder: sorted ? (sorted.desc ? 'desc' : 'asc') : '',
      });
    },
    onPaginationChange: (change) => {
      const next = typeof change === 'function' ? change(this.paginationState()) : change;
      this.updateState({ page: next.pageIndex + 1, pageSize: next.pageSize });
    },
  }));
  protected readonly total = computed(() => this.sessions.data()?.total ?? 0);
  protected readonly pageRows = computed(() => this.sessions.data()?.items ?? NO_SESSIONS);
  protected readonly changeableRows = computed(() =>
    this.pageRows().filter((session) => this.canChange(session))
  );
  protected readonly hasReadOnlyRows = computed(() =>
    this.pageRows().some((session) => !this.canChange(session))
  );
  protected readonly selectedSessions = computed(() => {
    const selected = new Set(this.selectedIds());
    return this.pageRows().filter((session) => selected.has(session.id));
  });
  protected readonly cancellableSelected = computed(() =>
    this.selectedSessions().filter(isCancellable)
  );
  protected readonly cancelDisabledHint = computed(() => {
    if (this.actionBusy()) return 'A bulk action is already running.';
    if (this.selectedIds().length && !this.cancellableSelected().length) {
      return 'None of the selected sessions can be cancelled: they have ended or a wallet has redeemed them.';
    }
    return '';
  });
  protected readonly allChangeableSelected = computed(
    () =>
      this.changeableRows().length > 0 &&
      this.changeableRows().every((session) => this.selectedIds().includes(session.id))
  );
  protected readonly someChangeableSelected = computed(() =>
    this.changeableRows().some((session) => this.selectedIds().includes(session.id))
  );
  protected readonly hasActiveFilters = computed(() => {
    this.state();
    this.filterVersion();
    const value = this.filters.getRawValue();
    return !!(
      value.q.trim() ||
      value.type ||
      value.status.length ||
      value.config.trim() ||
      value.createdFrom ||
      value.createdTo ||
      value.updated ||
      value.failureCode.trim()
    );
  });
  protected readonly hidesOpenSessions = computed(() => {
    const roles = this.caller()?.roles ?? [];
    return (
      roles.includes('sessions:read') &&
      !(
        canChangeSession(roles, { requestId: undefined }) &&
        canChangeSession(roles, { requestId: 'presentation' })
      )
    );
  });
  protected readonly canOfferIssuance = computed(() => this.hasRole('issuance:offer'));
  protected readonly canRequestPresentation = computed(() => this.hasRole('presentation:request'));

  constructor() {
    this.filters.valueChanges
      .pipe(debounceTime(300), takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.filterVersion.update((version) => version + 1);
        const values = this.filters.getRawValue();
        const error =
          this.dateRangeError(values.createdFrom, values.createdTo, 'Created') ||
          (values.updated === 'custom'
            ? this.dateRangeError(values.updatedFrom, values.updatedTo, 'Updated')
            : '');
        this.filterError.set(error);
        if (error) return;
        this.updateState({
          ...values,
          page: 1,
          q: values.q,
          type: values.type,
          status: values.status,
          updated: values.updated,
        });
      });

    this.route.queryParamMap
      .pipe(skip(1), takeUntilDestroyed(this.destroyRef))
      .subscribe((params) => {
        const restored = sessionListStateFromParams(params);
        this.state.set(restored);
        this.sorting.set(this.sortingFor(restored));
        this.filters.patchValue(this.filterValues(restored), { emitEvent: false });
        this.filterError.set('');
      });

    effect(() => {
      this.state();
      this.selectedIds.set([]);
    });

    effect(() => {
      const data = this.sessions.data();
      const state = this.state();
      if (data && state.page > Math.max(1, data.totalPages)) {
        this.updateState({ page: Math.max(1, data.totalPages) });
      }
    });
  }

  protected column(id: string): SortableColumn {
    return this.table.getColumn(id)!;
  }

  protected errorMessage(error: unknown): string {
    return getApiErrorMessage(error, 'Failed to load sessions');
  }

  protected hasRole(role: string): boolean {
    return this.caller()?.roles.includes(role) ?? false;
  }

  protected canChange(session: Session): boolean {
    return canChangeSession(this.caller()?.roles ?? [], session);
  }

  protected showPending(): void {
    this.filters.controls.status.setValue([...PENDING_STATUSES]);
  }

  protected selectedStatusLabel(): string {
    const selected = this.filters.controls.status.value;
    return selected.length
      ? STATUSES.filter((status) => selected.includes(status.value))
          .map((status) => status.label)
          .join(', ')
      : 'All statuses';
  }

  protected toggleStatus(status: SessionStatus, event: Event): void {
    const selected = this.filters.controls.status.value;
    const checked = (event.target as HTMLInputElement).checked;
    this.filters.controls.status.setValue(
      checked ? [...new Set([...selected, status])] : selected.filter((item) => item !== status)
    );
  }

  @HostListener('document:click', ['$event'])
  protected closeStatusDropdownOnOutsideClick(event: MouseEvent): void {
    const dropdown = this.statusDropdown()?.nativeElement;
    if (dropdown && event.target instanceof Node && !dropdown.contains(event.target)) {
      dropdown.open = false;
    }
  }

  protected isPendingSelected(): boolean {
    const selected = this.filters.controls.status.value;
    return (
      selected.length === PENDING_STATUSES.length &&
      PENDING_STATUSES.every((status) => selected.includes(status))
    );
  }

  protected clearFilters(): void {
    this.filters.reset({
      q: '',
      type: '',
      status: [],
      config: '',
      createdFrom: '',
      createdTo: '',
      updated: '',
      updatedFrom: '',
      updatedTo: '',
      failureCode: '',
    });
    this.filterError.set('');
  }

  protected toggleRow(session: Session, checked: boolean): void {
    if (!this.canChange(session)) return;
    this.selectedIds.update((ids) =>
      checked ? [...new Set([...ids, session.id])] : ids.filter((id) => id !== session.id)
    );
  }

  protected toggleAll(checked: boolean): void {
    const changeable = this.changeableRows().map((session) => session.id);
    this.selectedIds.update((ids) =>
      checked ? [...new Set([...ids, ...changeable])] : ids.filter((id) => !changeable.includes(id))
    );
  }

  protected refreshSessions(): void {
    void this.sessions.refetch();
  }

  protected openCancelDialog(): void {
    if (!this.cancellableSelected().length || this.actionBusy()) return;
    this.cancelForm.reset({ reason: '' });
    this.confirmingCancel.set(true);
  }

  protected openDeleteDialog(): void {
    if (!this.selectedSessions().length || this.actionBusy()) return;
    this.confirmingDelete.set(true);
  }

  protected clearSelection(): void {
    if (!this.actionBusy()) this.selectedIds.set([]);
  }

  protected async cancelSelected(): Promise<void> {
    if (this.actionBusy()) return;
    const sessions = this.cancellableSelected();
    if (!sessions.length || this.cancelForm.controls.reason.invalid) return;
    this.actionBusy.set(true);
    const reason = this.cancelForm.controls.reason.value.trim();
    try {
      const outcomes = await Promise.allSettled(
        sessions.map((session) =>
          this.cancelMutation.mutateAsync({ id: session.id, ...(reason ? { reason } : {}) })
        )
      );
      const rejected = outcomes.filter(
        (outcome): outcome is PromiseRejectedResult => outcome.status === 'rejected'
      );
      const conflicts = rejected.filter((outcome) => isCancelConflict(outcome.reason)).length;
      const failures = rejected.filter((outcome) => !isCancelConflict(outcome.reason));
      if (rejected.length) {
        this.notify.error(
          [
            `Cancelled ${sessions.length - rejected.length} of ${sessions.length} sessions`,
            ...(conflicts ? [`${conflicts} no longer pending`] : []),
            ...(failures.length
              ? [getApiErrorMessage(failures[0].reason, `${failures.length} failed`)]
              : []),
          ].join('; ')
        );
      } else {
        this.notify.success(
          `Cancelled ${sessions.length} ${sessions.length === 1 ? 'session' : 'sessions'}.`
        );
      }
      this.confirmingCancel.set(false);
      this.selectedIds.set([]);
      await this.invalidateSessionData();
    } finally {
      this.actionBusy.set(false);
    }
  }

  protected async deleteSelected(): Promise<void> {
    if (this.actionBusy()) return;
    const sessions = this.selectedSessions();
    if (!sessions.length) return;
    this.actionBusy.set(true);
    try {
      const outcomes = await Promise.allSettled(
        sessions.map((session) => this.deleteMutation.mutateAsync(session.id))
      );
      const rejected = outcomes.filter(
        (outcome): outcome is PromiseRejectedResult => outcome.status === 'rejected'
      );
      if (rejected.length) {
        this.notify.error(
          `Deleted ${sessions.length - rejected.length} of ${sessions.length} sessions; ` +
            getApiErrorMessage(rejected[0].reason, `${rejected.length} failed`)
        );
      } else {
        this.notify.success(
          `Deleted ${sessions.length} ${sessions.length === 1 ? 'session' : 'sessions'}.`
        );
      }
      this.confirmingDelete.set(false);
      this.selectedIds.set([]);
      await this.invalidateSessionData();
    } finally {
      this.actionBusy.set(false);
    }
  }

  protected closeCancelDialog(): void {
    if (!this.actionBusy()) this.confirmingCancel.set(false);
  }

  protected onCancelDialog(state: string): void {
    if (state === 'closed' && !this.actionBusy()) this.confirmingCancel.set(false);
  }

  protected onDeleteDialog(state: string): void {
    if (state === 'closed' && !this.actionBusy()) this.confirmingDelete.set(false);
  }

  private paginationState(): PaginationState {
    return { pageIndex: this.state().page - 1, pageSize: this.state().pageSize };
  }

  private sortingFor(state: SessionListState): SortingState {
    if (!state.sortBy || !state.sortOrder) return [];
    return [
      {
        id: state.sortBy === 'requestId' ? 'type' : state.sortBy,
        desc: state.sortOrder === 'desc',
      },
    ];
  }

  private sortField(id: string): SessionSortField {
    return id === 'type' ? 'requestId' : (id as SessionSortField);
  }

  private filterValues(state: SessionListState) {
    return {
      q: state.q,
      type: state.type,
      status: state.status,
      config: state.config,
      createdFrom: state.createdFrom,
      createdTo: state.createdTo,
      updated: state.updated,
      updatedFrom: state.updatedFrom,
      updatedTo: state.updatedTo,
      failureCode: state.failureCode,
    };
  }

  private dateRangeError(from: string, to: string, label: string): string {
    return from && to && from > to ? `${label} start must be on or before its end.` : '';
  }

  private updateState(patch: Partial<SessionListState>): void {
    this.state.update((current) => ({ ...current, ...patch }));
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: sessionListUrlParams(this.state()),
      replaceUrl: true,
    });
  }

  private async invalidateSessionData(): Promise<void> {
    await Promise.all([
      this.queryClient.invalidateQueries({
        queryKey: ['sessions', this.instance, this.tenant()],
      }),
      this.queryClient.invalidateQueries({
        queryKey: ['session-stats', this.instance, this.tenant()],
      }),
    ]);
  }
}
