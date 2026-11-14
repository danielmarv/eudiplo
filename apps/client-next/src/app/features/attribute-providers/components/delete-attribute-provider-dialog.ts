import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import type { AttributeProviderEntity } from '@eudiplo/sdk-core';
import { HlmAlertDialogImports } from '@spartan-ng/helm/alert-dialog';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import { injectMutation, QueryClient } from '@tanstack/angular-query-experimental';
import { CallerService } from '../../../core/auth/caller.service';
import { SessionService } from '../../../core/auth/session.service';
import { getApiErrorMessage } from '../../../core/errors/error-message';
import { NotifyService } from '../../../core/notify/notify.service';
import {
  attributeProvidersKey,
  deleteAttributeProviderMutation,
} from '../data/attribute-provider-queries';

/**
 * Asks before an attribute provider is deleted, naming it and the credential types that fetch
 * their claims from it: the backend deletes it anyway, and issuing those types fails until they
 * use another one. It is open while `provider` is set; `closed` asks the page to clear it, and
 * `deleted` says the provider is gone. It cannot be closed while the deletion runs.
 */
@Component({
  selector: 'app-delete-attribute-provider-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [HlmAlertDialogImports, HlmButtonImports],
  template: `
    <hlm-alert-dialog [state]="provider() ? 'open' : 'closed'" (stateChanged)="onState($event)">
      <hlm-alert-dialog-content *hlmAlertDialogPortal="let ctx">
        <hlm-alert-dialog-header>
          <h2 hlmAlertDialogTitle>Delete {{ provider()?.name || provider()?.id }}?</h2>
          <div hlmAlertDialogDescription class="grid gap-2">
            <p>
              This deletes the attribute provider
              <span class="font-mono break-all">{{ provider()?.id }}</span
              >. It cannot be undone.
            </p>
            @if (usedBy().length) {
              <p class="text-destructive font-medium" role="alert">
                {{
                  usedBy().length === 1
                    ? '1 credential type fetches its'
                    : usedBy().length + ' credential types fetch their'
                }}
                claims from it: {{ usedBy().join(', ') }}. Issuing
                {{ usedBy().length === 1 ? 'it' : 'them' }} fails until
                {{ usedBy().length === 1 ? 'it uses' : 'they use' }} another provider.
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
            {{ deleting() ? 'Deleting…' : 'Delete attribute provider' }}
          </button>
        </hlm-alert-dialog-footer>
      </hlm-alert-dialog-content>
    </hlm-alert-dialog>
  `,
})
export class DeleteAttributeProviderDialog {
  private readonly notify = inject(NotifyService);
  private readonly queryClient = inject(QueryClient);
  private readonly instance = inject(SessionService).getBaseUrl();
  private readonly caller = inject(CallerService).loadedCaller;
  private readonly tenant = computed(() => this.caller()?.tenantId);
  private readonly deletion = injectMutation(() => deleteAttributeProviderMutation());

  /** The provider to ask about; the dialog is open while it is set. */
  readonly provider = input<AttributeProviderEntity | null>(null);
  /** The IDs of the credential types that use it. */
  readonly usedBy = input<string[]>([]);
  readonly closed = output<void>();
  readonly deleted = output<AttributeProviderEntity>();

  protected readonly deleting = this.deletion.isPending;

  protected onState(state: string): void {
    // Escape or a click outside closes the dialog, as Cancel does; not while it deletes.
    if (state === 'closed' && this.provider() && !this.deleting()) this.closed.emit();
  }

  protected confirm(): void {
    const provider = this.provider();
    if (!provider || this.deleting()) return;
    const all = attributeProvidersKey(this.instance, this.tenant());
    this.deletion.mutate(provider.id, {
      onSuccess: () => {
        this.queryClient.setQueryData<AttributeProviderEntity[]>(all, (list) =>
          list?.filter((entry) => entry.id !== provider.id)
        );
        void this.queryClient.invalidateQueries({ queryKey: all, exact: true });
        this.queryClient.removeQueries({ queryKey: [...all, provider.id], type: 'inactive' });
        this.notify.success(`Attribute provider ${provider.name || provider.id} deleted.`);
        this.deleted.emit(provider);
        this.closed.emit();
      },
      onError: (error) =>
        this.notify.error(getApiErrorMessage(error, 'Failed to delete the attribute provider')),
    });
  }
}
