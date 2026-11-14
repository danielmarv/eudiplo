import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import type { StatusListResponseDto } from '@eudiplo/sdk-core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideArrowLeft,
  lucideCircleCheck,
  lucideCircleDashed,
  lucideClock,
  lucideCopy,
  lucideExternalLink,
  lucideListChecks,
  lucideLock,
  lucideRefreshCw,
  lucideTrash2,
  lucideTriangleAlert,
} from '@ng-icons/lucide';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import { HlmSkeletonImports } from '@spartan-ng/helm/skeleton';
import { HlmSpinnerImports } from '@spartan-ng/helm/spinner';
import { HlmTooltipImports } from '@spartan-ng/helm/tooltip';
import { injectMutation, injectQuery, QueryClient } from '@tanstack/angular-query-experimental';
import { CallerService } from '../../../core/auth/caller.service';
import { SessionService } from '../../../core/auth/session.service';
import { getApiErrorMessage, hasHttpStatus } from '../../../core/errors/error-message';
import { NotifyService } from '../../../core/notify/notify.service';
import { copyText } from '../../../shared/clipboard/copy-text';
import {
  configOwnershipQuery,
  fileManaged,
  lockReason,
} from '../../../shared/config-ownership/config-ownership';
import { OwnershipNotice } from '../../../shared/config-ownership/ownership-notice';
import { dateTime } from '../../../shared/format/date-time';
import { relativeTime } from '../../../shared/format/relative-time';
import { PageHeader } from '../../../shared/pages/page-header';
import { StatusListBindingFields } from '../components/binding-fields';
import { DeleteStatusListDialog } from '../components/delete-status-list-dialog';
import { UsageMeter } from '../components/usage-meter';
import { BIT_LABELS, count, TOKEN_STATES, tokenState } from '../data/status-list-display';
import {
  statusListKey,
  statusListQuery,
  statusListsKey,
  updateStatusListMutation,
} from '../data/status-list-queries';

/**
 * One status list: its address, how full it is and whether its signed copy is current, and what
 * it is bound to, which can be changed here. A list no credential uses can be deleted; a list a
 * file provisioned is read-only here, and the page says so.
 */
@Component({
  selector: 'app-status-list-detail',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    RouterLink,
    NgIcon,
    HlmButtonImports,
    HlmSkeletonImports,
    HlmSpinnerImports,
    HlmTooltipImports,
    DeleteStatusListDialog,
    OwnershipNotice,
    PageHeader,
    StatusListBindingFields,
    UsageMeter,
  ],
  providers: [
    provideIcons({
      lucideArrowLeft,
      lucideCircleCheck,
      lucideCircleDashed,
      lucideClock,
      lucideCopy,
      lucideExternalLink,
      lucideListChecks,
      lucideLock,
      lucideRefreshCw,
      lucideTrash2,
      lucideTriangleAlert,
    }),
  ],
  templateUrl: './status-list-detail.html',
})
export class StatusListDetail {
  /** The list's ID, from the route. */
  readonly listId = input.required<string>();

  private readonly instance = inject(SessionService).getBaseUrl();
  private readonly caller = inject(CallerService).loadedCaller;
  private readonly tenant = computed(() => this.caller()?.tenantId);
  private readonly router = inject(Router);
  private readonly queryClient = inject(QueryClient);
  private readonly notify = inject(NotifyService);

  protected readonly list = injectQuery(() =>
    statusListQuery(this.instance, this.tenant(), this.listId())
  );
  private readonly ownership = injectQuery(() =>
    configOwnershipQuery(this.instance, this.tenant(), 'StatusList')
  );
  protected readonly owner = computed(() =>
    this.ownership.data()?.find((resource) => resource.resourceId === this.listId())
  );
  /** Why the list cannot be changed here, or nothing when it can. */
  protected readonly locked = computed(() => {
    const managed = fileManaged(this.ownership.data()).get(this.listId());
    return managed ? lockReason(managed) : '';
  });
  /** Why the list cannot be deleted, or nothing when it can. */
  protected readonly undeletable = computed(() => {
    if (this.locked()) return this.locked();
    return (this.list.data()?.usedEntries ?? 0) > 0
      ? 'Credentials use it, so it cannot be deleted'
      : '';
  });

  protected readonly form = new FormGroup({
    credentialConfigurationId: new FormControl('', { nonNullable: true }),
    keyChainId: new FormControl('', { nonNullable: true }),
  });
  private readonly update = injectMutation(() => updateStatusListMutation());
  protected readonly saving = this.update.isPending;
  protected readonly toDelete = signal<StatusListResponseDto | null>(null);

  protected readonly token = computed(() => {
    const list = this.list.data();
    return list ? { state: tokenState(list), ...TOKEN_STATES[tokenState(list)] } : undefined;
  });

  protected readonly bitLabels = BIT_LABELS;
  protected readonly count = count;
  protected readonly dateTime = dateTime;
  protected readonly relativeTime = relativeTime;

  constructor() {
    // Show what the list is bound to, unless the user changed it already.
    effect(() => {
      const list = this.list.data();
      if (!list) return;
      untracked(() => {
        if (this.form.dirty) return;
        this.form.reset({
          credentialConfigurationId: list.credentialConfigurationId ?? '',
          keyChainId: list.keyChainId ?? '',
        });
      });
    });
  }

  protected save(): void {
    const list = this.list.data();
    if (!list || this.saving() || this.locked()) return;
    const value = this.form.getRawValue();
    // `null` removes a binding; an unchanged one is left out, so the list keeps its signature.
    const credential = value.credentialConfigurationId || null;
    const keyChain = value.keyChainId || null;
    const body = {
      ...(credential !== (list.credentialConfigurationId ?? null)
        ? { credentialConfigurationId: credential }
        : {}),
      ...(keyChain !== (list.keyChainId ?? null) ? { keyChainId: keyChain } : {}),
    };
    if (!Object.keys(body).length) {
      this.notify.info('Nothing changed.');
      return;
    }
    this.update.mutate(
      { id: list.id, body },
      {
        onSuccess: (updated) => {
          this.queryClient.setQueryData(
            statusListKey(this.instance, this.tenant(), list.id),
            updated
          );
          void this.queryClient.invalidateQueries({
            queryKey: statusListsKey(this.instance, this.tenant()),
            exact: true,
          });
          this.form.reset({
            credentialConfigurationId: updated.credentialConfigurationId ?? '',
            keyChainId: updated.keyChainId ?? '',
          });
          this.notify.success(
            'keyChainId' in body
              ? 'Status list saved. It is signed with the new key chain on its next request.'
              : 'Status list saved.'
          );
        },
        onError: (error) =>
          this.notify.error(getApiErrorMessage(error, 'Failed to save the status list')),
      }
    );
  }

  protected discard(): void {
    const list = this.list.data();
    if (!list) return;
    this.form.reset({
      credentialConfigurationId: list.credentialConfigurationId ?? '',
      keyChainId: list.keyChainId ?? '',
    });
  }

  protected copyUri(uri: string): void {
    void copyText(this.notify, uri, 'Status list address');
  }

  protected onDeleted(): void {
    void this.router.navigate(['/status-lists']);
  }

  protected notFound(error: unknown): boolean {
    return hasHttpStatus(error, 404);
  }

  protected errorMessage(error: unknown): string {
    return getApiErrorMessage(error, 'Failed to load the status list');
  }
}
