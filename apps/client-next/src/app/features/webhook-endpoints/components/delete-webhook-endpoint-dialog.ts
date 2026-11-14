import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import type { WebhookEndpointEntity } from '@eudiplo/sdk-core';
import { HlmAlertDialogImports } from '@spartan-ng/helm/alert-dialog';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import { injectMutation, QueryClient } from '@tanstack/angular-query-experimental';
import { CallerService } from '../../../core/auth/caller.service';
import { SessionService } from '../../../core/auth/session.service';
import { getApiErrorMessage } from '../../../core/errors/error-message';
import { NotifyService } from '../../../core/notify/notify.service';
import {
  webhookEndpointsKey,
  deleteWebhookEndpointMutation,
} from '../data/webhook-endpoint-queries';

/**
 * Asks before a webhook endpoint is deleted, naming it and the configurations that send their
 * notifications to it: the backend deletes it anyway, and those notifications are lost until the
 * configurations use another endpoint. It is open while `endpoint` is set; `closed` asks the page
 * to clear it, and `deleted` says the endpoint is gone. It cannot be closed while it deletes.
 */
@Component({
  selector: 'app-delete-webhook-endpoint-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [HlmAlertDialogImports, HlmButtonImports],
  template: `
    <hlm-alert-dialog [state]="endpoint() ? 'open' : 'closed'" (stateChanged)="onState($event)">
      <hlm-alert-dialog-content *hlmAlertDialogPortal="let ctx">
        <hlm-alert-dialog-header>
          <h2 hlmAlertDialogTitle>Delete {{ endpoint()?.name || endpoint()?.id }}?</h2>
          <div hlmAlertDialogDescription class="grid gap-2">
            <p>
              This deletes the webhook endpoint
              <span class="font-mono break-all">{{ endpoint()?.id }}</span
              >. It cannot be undone.
            </p>
            @if (usedBy().length) {
              <p class="text-destructive font-medium" role="alert">
                {{
                  usedBy().length === 1
                    ? '1 configuration sends'
                    : usedBy().length + ' configurations send'
                }}
                notifications to it: {{ usedBy().join(', ') }}. They are lost until
                {{ usedBy().length === 1 ? 'it uses' : 'they use' }} another endpoint.
              </p>
            }
          </div>
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
            {{ deleting() ? 'Deleting…' : 'Delete webhook endpoint' }}
          </button>
        </hlm-alert-dialog-footer>
      </hlm-alert-dialog-content>
    </hlm-alert-dialog>
  `,
})
export class DeleteWebhookEndpointDialog {
  private readonly notify = inject(NotifyService);
  private readonly queryClient = inject(QueryClient);
  private readonly instance = inject(SessionService).getBaseUrl();
  private readonly caller = inject(CallerService).loadedCaller;
  private readonly tenant = computed(() => this.caller()?.tenantId);
  private readonly deletion = injectMutation(() => deleteWebhookEndpointMutation());

  /** The endpoint to ask about; the dialog is open while it is set. */
  readonly endpoint = input<WebhookEndpointEntity | null>(null);
  /** The IDs of the configurations that use it. */
  readonly usedBy = input<string[]>([]);
  readonly closed = output<void>();
  readonly deleted = output<WebhookEndpointEntity>();

  protected readonly deleting = this.deletion.isPending;

  protected onState(state: string): void {
    // Escape or a click outside closes the dialog, as Cancel does; not while it deletes.
    if (state === 'closed' && this.endpoint() && !this.deleting()) this.closed.emit();
  }

  protected confirm(): void {
    const endpoint = this.endpoint();
    if (!endpoint || this.deleting()) return;
    const all = webhookEndpointsKey(this.instance, this.tenant());
    this.deletion.mutate(endpoint.id, {
      onSuccess: () => {
        this.queryClient.setQueryData<WebhookEndpointEntity[]>(all, (list) =>
          list?.filter((entry) => entry.id !== endpoint.id)
        );
        void this.queryClient.invalidateQueries({ queryKey: all, exact: true });
        this.queryClient.removeQueries({ queryKey: [...all, endpoint.id], type: 'inactive' });
        this.notify.success(`Webhook endpoint ${endpoint.name || endpoint.id} deleted.`);
        this.deleted.emit(endpoint);
        this.closed.emit();
      },
      onError: (error) =>
        this.notify.error(getApiErrorMessage(error, 'Failed to delete the webhook endpoint')),
    });
  }
}
