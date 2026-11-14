import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import type { StatusListResponseDto } from '@eudiplo/sdk-core';
import { HlmAlertDialogImports } from '@spartan-ng/helm/alert-dialog';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import { injectMutation, QueryClient } from '@tanstack/angular-query-experimental';
import { CallerService } from '../../../core/auth/caller.service';
import { SessionService } from '../../../core/auth/session.service';
import { getApiErrorMessage } from '../../../core/errors/error-message';
import { NotifyService } from '../../../core/notify/notify.service';
import {
  deleteStatusListMutation,
  statusListKey,
  statusListsKey,
} from '../data/status-list-queries';

/**
 * Asks before a status list is deleted, naming it, and deletes it on confirmation. It is open
 * while `list` is set. `closed` asks the page to clear it, after Cancel, Escape or a deletion;
 * `deleted` says the list is gone. It cannot be closed while the deletion runs.
 */
@Component({
  selector: 'app-delete-status-list-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [HlmAlertDialogImports, HlmButtonImports],
  template: `
    <hlm-alert-dialog [state]="list() ? 'open' : 'closed'" (stateChanged)="onState($event)">
      <hlm-alert-dialog-content *hlmAlertDialogPortal="let ctx">
        <hlm-alert-dialog-header>
          <h2 hlmAlertDialogTitle>Delete this status list?</h2>
          <p hlmAlertDialogDescription>
            This deletes the status list <span class="font-mono break-all">{{ list()?.id }}</span
            >. No credential uses it yet. It cannot be undone.
          </p>
        </hlm-alert-dialog-header>
        <hlm-alert-dialog-footer>
          <button hlmAlertDialogCancel type="button" [disabled]="deleting()" (click)="ctx.close()">
            Cancel
          </button>
          <button
            hlmAlertDialogAction
            variant="destructive"
            type="button"
            [disabled]="deleting()"
            (click)="confirm()"
          >
            {{ deleting() ? 'Deleting…' : 'Delete status list' }}
          </button>
        </hlm-alert-dialog-footer>
      </hlm-alert-dialog-content>
    </hlm-alert-dialog>
  `,
})
export class DeleteStatusListDialog {
  private readonly notify = inject(NotifyService);
  private readonly queryClient = inject(QueryClient);
  private readonly instance = inject(SessionService).getBaseUrl();
  private readonly caller = inject(CallerService).loadedCaller;
  private readonly tenant = computed(() => this.caller()?.tenantId);
  private readonly deletion = injectMutation(() => deleteStatusListMutation());

  /** The list to ask about; the dialog is open while it is set. */
  readonly list = input<StatusListResponseDto | null>(null);
  readonly closed = output<void>();
  readonly deleted = output<StatusListResponseDto>();

  protected readonly deleting = this.deletion.isPending;

  protected onState(state: string): void {
    // Escape or a click outside closes the dialog, as Cancel does; not while it deletes.
    if (state === 'closed' && this.list() && !this.deleting()) this.closed.emit();
  }

  protected confirm(): void {
    const list = this.list();
    if (!list || this.deleting()) return;
    const lists = statusListsKey(this.instance, this.tenant());
    this.deletion.mutate(list.id, {
      onSuccess: () => {
        this.queryClient.setQueryData<StatusListResponseDto[]>(lists, (all) =>
          all?.filter((entry) => entry.id !== list.id)
        );
        void this.queryClient.invalidateQueries({ queryKey: lists, exact: true });
        this.queryClient.removeQueries({
          queryKey: statusListKey(this.instance, this.tenant(), list.id),
          type: 'inactive',
        });
        this.notify.success('Status list deleted.');
        this.deleted.emit(list);
        this.closed.emit();
      },
      onError: (error) =>
        this.notify.error(getApiErrorMessage(error, 'Failed to delete the status list')),
    });
  }
}
