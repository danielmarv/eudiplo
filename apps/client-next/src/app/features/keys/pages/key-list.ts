import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import type { KeyChainResponseDto } from '@eudiplo/sdk-core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideArrowRight,
  lucideCircleAlert,
  lucideKeyRound,
  lucideLock,
  lucidePencil,
  lucidePlus,
  lucideRefreshCw,
  lucideRotateCw,
  lucideSearch,
  lucideShieldCheck,
  lucideStar,
  lucideStarOff,
  lucideTrash2,
  lucideTriangleAlert,
  lucideX,
} from '@ng-icons/lucide';
import { HlmAlertDialogImports } from '@spartan-ng/helm/alert-dialog';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import { HlmFieldImports } from '@spartan-ng/helm/field';
import { HlmInputImports } from '@spartan-ng/helm/input';
import { HlmNativeSelectImports } from '@spartan-ng/helm/native-select';
import { HlmSkeletonImports } from '@spartan-ng/helm/skeleton';
import { HlmTableImports } from '@spartan-ng/helm/table';
import { HlmTooltipImports } from '@spartan-ng/helm/tooltip';
import { injectMutation, injectQuery, QueryClient } from '@tanstack/angular-query-experimental';
import { CallerService } from '../../../core/auth/caller.service';
import { SessionService } from '../../../core/auth/session.service';
import { getApiErrorMessage } from '../../../core/errors/error-message';
import { NotifyService } from '../../../core/notify/notify.service';
import {
  configOwnershipQuery,
  fileManaged,
  lockReason,
} from '../../../shared/config-ownership/config-ownership';
import {
  type ColumnDef,
  injectTable,
  type PaginationState,
  type SortingState,
} from '@tanstack/angular-table';
import { SortToggle } from '../../../shared/data-table/sort-toggle';
import {
  ariaSort,
  type ListFeatures,
  listFeatures,
  PAGE_SIZES,
  type SortableColumn,
} from '../../../shared/data-table/table-features';
import { TablePagination } from '../../../shared/data-table/table-pagination';
import { applyChange } from '../../../shared/data-table/table-state';
import { PageHeader } from '../../../shared/pages/page-header';
import {
  defaultAccessChip,
  defaultAccessDeleteRefusal,
  isConfiguredDefaultAccess,
  keyChainDeleteQuestion,
  missingDefaultAccessMessage,
  usageLabel,
} from '../data/key-display';
import {
  defaultAccessKeyChainKey,
  defaultAccessKeyChainQuery,
  deleteKeyChainMutation,
  keyChainsKey,
  keyChainsQuery,
  rotateKeyChainMutation,
  setDefaultAccessKeyChainMutation,
} from '../data/key-queries';

type PendingAction = { kind: 'delete' | 'rotate'; key: KeyChainResponseDto } | null;

const COLUMNS: ColumnDef<ListFeatures, KeyChainResponseDto>[] = [
  { id: 'name', accessorFn: (key) => key.description || key.id, sortFn: 'alphanumeric' },
  { id: 'usage', accessorFn: (key) => usageLabel(key.usageType), sortFn: 'text' },
  { id: 'type', accessorFn: (key) => key.type, sortFn: 'text' },
  { id: 'kms', accessorFn: (key) => key.kmsProvider, sortFn: 'alphanumeric' },
  { id: 'rotation', accessorFn: (key) => (key.rotationPolicy.enabled ? 1 : 0), sortFn: 'basic' },
];

/** Searchable and filterable key chains with tenant default and file-ownership safeguards. */
@Component({
  selector: 'app-key-list',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    RouterLink,
    NgIcon,
    HlmAlertDialogImports,
    HlmButtonImports,
    HlmFieldImports,
    HlmInputImports,
    HlmNativeSelectImports,
    HlmSkeletonImports,
    HlmTableImports,
    HlmTooltipImports,
    PageHeader,
    SortToggle,
    TablePagination,
  ],
  providers: [
    provideIcons({
      lucideArrowRight,
      lucideCircleAlert,
      lucideKeyRound,
      lucideLock,
      lucidePencil,
      lucidePlus,
      lucideRefreshCw,
      lucideRotateCw,
      lucideSearch,
      lucideShieldCheck,
      lucideStar,
      lucideStarOff,
      lucideTrash2,
      lucideTriangleAlert,
      lucideX,
    }),
  ],
  templateUrl: './key-list.html',
})
export class KeyList {
  private readonly instance = inject(SessionService).getBaseUrl();
  private readonly router = inject(Router);
  private readonly caller = inject(CallerService).loadedCaller;
  private readonly tenant = computed(() => this.caller()?.tenantId);
  private readonly queryClient = inject(QueryClient);
  private readonly notify = inject(NotifyService);

  protected readonly keys = injectQuery(() => keyChainsQuery(this.instance, this.tenant()));
  protected readonly defaultAccess = injectQuery(() =>
    defaultAccessKeyChainQuery(this.instance, this.tenant())
  );
  private readonly ownership = injectQuery(() =>
    configOwnershipQuery(this.instance, this.tenant(), 'KeyChain')
  );
  private readonly defaultsOwnership = injectQuery(() =>
    configOwnershipQuery(this.instance, this.tenant(), 'KeyChainDefaults')
  );

  protected readonly filters = new FormGroup({
    search: new FormControl('', { nonNullable: true }),
    usage: new FormControl('', { nonNullable: true }),
    type: new FormControl('', { nonNullable: true }),
    provider: new FormControl('', { nonNullable: true }),
  });
  private readonly filterValue = signal(this.filters.getRawValue());
  protected readonly pendingAction = signal<PendingAction>(null);

  private readonly deletion = injectMutation(() => deleteKeyChainMutation());
  private readonly rotation = injectMutation(() => rotateKeyChainMutation());
  private readonly defaultChange = injectMutation(() => setDefaultAccessKeyChainMutation());

  protected readonly busy = computed(
    () => this.deletion.isPending() || this.rotation.isPending() || this.defaultChange.isPending()
  );
  protected readonly managed = computed(() => fileManaged(this.ownership.data()));
  protected readonly defaultsManaged = computed(() => fileManaged(this.defaultsOwnership.data()));
  protected readonly matching = computed(() => {
    const filter = this.filterValue();
    const search = filter.search.trim().toLocaleLowerCase();
    return (this.keys.data() ?? []).filter((key) => {
      const textMatch =
        !search ||
        [key.id, key.description, key.usageType, key.type, key.kmsProvider]
          .filter(Boolean)
          .some((value) => value!.toLocaleLowerCase().includes(search));
      return (
        textMatch &&
        (!filter.usage || key.usageType === filter.usage) &&
        (!filter.type || key.type === filter.type) &&
        (!filter.provider || key.kmsProvider === filter.provider)
      );
    });
  });
  protected readonly providers = computed(() =>
    [...new Set((this.keys.data() ?? []).map((key) => key.kmsProvider))].sort((a, b) =>
      a.localeCompare(b)
    )
  );
  protected readonly defaultMissing = computed(() =>
    missingDefaultAccessMessage(this.defaultAccess.data())
  );
  protected readonly usages = [
    { value: 'attestation', label: 'Credential signing' },
    { value: 'access', label: 'Wallet access certificate' },
    { value: 'authorizationServer', label: 'Authorization server' },
    { value: 'statusList', label: 'Status list' },
    { value: 'trustList', label: 'Trust list' },
    { value: 'federation', label: 'OpenID Federation' },
    { value: 'encrypt', label: 'Encryption' },
  ];
  protected readonly usageLabel = usageLabel;
  protected readonly isDefault = isConfiguredDefaultAccess;
  protected readonly defaultChip = defaultAccessChip;
  protected readonly ariaSort = ariaSort;

  private readonly sorting = signal<SortingState>([{ id: 'name', desc: false }]);
  private readonly pagination = signal<PaginationState>({ pageIndex: 0, pageSize: PAGE_SIZES[0] });

  /** The filtered keys, sorted by column and shown a page at a time. */
  protected readonly table = injectTable(() => ({
    features: listFeatures,
    columns: COLUMNS,
    data: this.matching(),
    getRowId: (key) => key.id,
    state: { sorting: this.sorting(), pagination: this.pagination() },
    enableSortingRemoval: false,
    autoResetPageIndex: false,
    onSortingChange: (change) => {
      applyChange(this.sorting, change);
      this.toFirstPage();
    },
    onPaginationChange: (change) => applyChange(this.pagination, change),
  }));

  constructor() {
    this.filters.valueChanges.subscribe(() => {
      this.filterValue.set(this.filters.getRawValue());
      this.toFirstPage();
    });
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

  private toFirstPage(): void {
    this.pagination.update((page) => ({ ...page, pageIndex: 0 }));
  }

  protected resetFilters(): void {
    this.filters.reset({ search: '', usage: '', type: '', provider: '' });
  }

  protected displayName(key: KeyChainResponseDto): string {
    return key.description || key.id;
  }

  protected openEdit(key: KeyChainResponseDto): void {
    const reason = this.keyLock(key);
    if (reason) {
      this.notify.error(reason);
      return;
    }
    void this.router.navigate(['/keys', key.id, 'edit']);
  }

  protected keyLock(key: KeyChainResponseDto): string {
    const resource = this.managed().get(key.id);
    return resource ? lockReason(resource) : '';
  }

  protected defaultLock(): string {
    const resource = this.defaultsManaged().get('defaults');
    return resource ? lockReason(resource) : '';
  }

  protected requestDelete(key: KeyChainResponseDto): void {
    const refusal = defaultAccessDeleteRefusal(this.defaultAccess.data(), key.id);
    if (refusal) {
      this.notify.error(refusal);
      return;
    }
    if (this.keyLock(key)) {
      this.notify.error(this.keyLock(key));
      return;
    }
    this.pendingAction.set({ kind: 'delete', key });
  }

  protected requestRotation(key: KeyChainResponseDto): void {
    if (!key.rotationPolicy.enabled) return;
    if (this.keyLock(key)) {
      this.notify.error(this.keyLock(key));
      return;
    }
    this.pendingAction.set({ kind: 'rotate', key });
  }

  protected closeActionDialog(): void {
    if (!this.busy()) this.pendingAction.set(null);
  }

  protected confirmAction(): void {
    const action = this.pendingAction();
    if (!action || this.busy()) return;
    if (this.keyLock(action.key)) {
      this.pendingAction.set(null);
      this.notify.error(this.keyLock(action.key));
      return;
    }
    if (action.kind === 'delete') {
      this.deletion.mutate(action.key.id, {
        onSuccess: () => {
          this.removeFromCache(action.key.id);
          this.pendingAction.set(null);
          this.notify.success('Key chain deleted.');
        },
        onError: (error) => {
          this.pendingAction.set(null);
          this.notify.error(getApiErrorMessage(error, 'Failed to delete the key chain'));
        },
      });
      return;
    }
    this.rotation.mutate(action.key.id, {
      onSuccess: () => {
        this.pendingAction.set(null);
        this.notify.success('Key chain rotated.');
        void this.invalidateKeys();
      },
      onError: (error) => {
        this.pendingAction.set(null);
        this.notify.error(getApiErrorMessage(error, 'Failed to rotate the key chain'));
      },
    });
  }

  protected setDefault(id: string | null): void {
    if (this.busy()) return;
    if (this.defaultLock()) {
      this.notify.error(this.defaultLock());
      return;
    }
    this.defaultChange.mutate(id, {
      onSuccess: (info) => {
        this.queryClient.setQueryData(defaultAccessKeyChainKey(this.instance, this.tenant()), info);
        this.notify.success(
          info.defaultAccessKeyChainId
            ? 'Default access key chain set.'
            : 'Default access key chain removed; EUDIPLO picks one by rule.'
        );
      },
      onError: (error) =>
        this.notify.error(
          getApiErrorMessage(error, 'Failed to change the default access key chain')
        ),
    });
  }

  protected retryDefault(): void {
    void this.defaultAccess.refetch();
  }

  protected deleteQuestion(action: PendingAction): string {
    return action?.kind === 'delete' ? keyChainDeleteQuestion(action.key) : '';
  }

  protected errorMessage(error: unknown): string {
    return getApiErrorMessage(error, 'Failed to load the key chains');
  }

  private removeFromCache(id: string): void {
    const listKey = keyChainsKey(this.instance, this.tenant());
    this.queryClient.setQueryData<KeyChainResponseDto[]>(listKey, (keys) =>
      keys?.filter((key) => key.id !== id)
    );
    this.queryClient.removeQueries({
      queryKey: keyChainsKey(this.instance, this.tenant()).concat(id),
      type: 'inactive',
    });
    void this.queryClient.invalidateQueries({ queryKey: listKey, exact: true });
    void this.queryClient.invalidateQueries({
      queryKey: defaultAccessKeyChainKey(this.instance, this.tenant()),
      exact: true,
    });
  }

  private async invalidateKeys(): Promise<void> {
    await this.queryClient.invalidateQueries({
      queryKey: keyChainsKey(this.instance, this.tenant()),
      exact: true,
    });
  }
}
