import { ChangeDetectionStrategy, Component, inject, input, output } from '@angular/core';
import type { TenantResponseDto } from '@eudiplo/sdk-core';
import { HlmAlertDialogImports } from '@spartan-ng/helm/alert-dialog';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import { injectMutation, QueryClient } from '@tanstack/angular-query-experimental';
import { SessionService } from '../../../core/auth/session.service';
import { getApiErrorMessage } from '../../../core/errors/error-message';
import { NotifyService } from '../../../core/notify/notify.service';
import { deleteTenantMutation, tenantKey, tenantsKey } from '../data/tenant-queries';

/**
 * Asks before a tenant is deleted, naming it, and deletes it on confirmation. It is open while
 * `tenant` is set. `closed` asks the page to clear it, after Cancel, Escape or a deletion;
 * `deleted` says the tenant is gone. It cannot be closed while the deletion runs.
 */
@Component({
  selector: 'app-delete-tenant-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [HlmAlertDialogImports, HlmButtonImports],
  template: `
    <hlm-alert-dialog [state]="tenant() ? 'open' : 'closed'" (stateChanged)="onState($event)">
      <hlm-alert-dialog-content *hlmAlertDialogPortal="let ctx">
        <hlm-alert-dialog-header>
          <h2 hlmAlertDialogTitle>Delete tenant {{ tenant()?.name }}?</h2>
          <p hlmAlertDialogDescription>
            This deletes the tenant <span class="font-mono">{{ tenant()?.id }}</span> and all its
            data, including its clients, keys and uploaded files. It cannot be undone.
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
            {{ deleting() ? 'Deleting…' : 'Delete tenant' }}
          </button>
        </hlm-alert-dialog-footer>
      </hlm-alert-dialog-content>
    </hlm-alert-dialog>
  `,
})
export class DeleteTenantDialog {
  private readonly notify = inject(NotifyService);
  private readonly queryClient = inject(QueryClient);
  private readonly instance = inject(SessionService).getBaseUrl();
  private readonly deletion = injectMutation(() => deleteTenantMutation());

  /** The tenant to ask about; the dialog is open while it is set. */
  readonly tenant = input<TenantResponseDto | null>(null);
  readonly closed = output<void>();
  readonly deleted = output<TenantResponseDto>();

  protected readonly deleting = this.deletion.isPending;

  protected onState(state: string): void {
    // Escape or a click outside closes the dialog, as Cancel does; not while it deletes.
    if (state === 'closed' && this.tenant() && !this.deleting()) this.closed.emit();
  }

  protected confirm(): void {
    const tenant = this.tenant();
    if (!tenant || this.deleting()) return;
    this.deletion.mutate(tenant.id, {
      onSuccess: () => {
        this.queryClient.setQueryData<TenantResponseDto[]>(tenantsKey(this.instance), (list) =>
          list?.filter((entry) => entry.id !== tenant.id)
        );
        // Only the list: the page of the deleted tenant, if open, would load it again and fail.
        void this.queryClient.invalidateQueries({
          queryKey: tenantsKey(this.instance),
          exact: true,
        });
        this.queryClient.removeQueries({
          queryKey: tenantKey(this.instance, tenant.id),
          type: 'inactive',
        });
        this.notify.success(`Tenant ${tenant.name} deleted.`);
        this.deleted.emit(tenant);
        this.closed.emit();
      },
      onError: (error) => {
        console.error('Failed to delete the tenant:', error);
        this.notify.error(getApiErrorMessage(error, `Failed to delete tenant ${tenant.name}`));
      },
    });
  }
}
