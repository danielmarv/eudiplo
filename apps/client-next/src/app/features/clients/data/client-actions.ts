import { inject, Injectable, signal } from '@angular/core';
import { Router } from '@angular/router';
import type { ClientEntity, TenantClientCredentialsDto } from '@eudiplo/sdk-core';
import { injectMutation, QueryClient } from '@tanstack/angular-query-experimental';
import { CallerService } from '../../../core/auth/caller.service';
import { SessionService } from '../../../core/auth/session.service';
import { getApiErrorMessage } from '../../../core/errors/error-message';
import { NotifyService } from '../../../core/notify/notify.service';
import { ConfirmService } from '../../../shared/dialogs/confirm';
import { clientsKey, deleteClientMutation, rotateSecretMutation } from './client-queries';

/** What to confirm before a client is deleted; it warns when the caller signed in with it. */
function deleteConfirmation(clientId: string, signedInClientId?: string): string[] {
  return [
    'Services can no longer sign in with this client, and tokens already issued to it stop working, also if a client with this ID is created again. With single sign-on (Keycloak), those tokens stay valid until they expire. This cannot be undone.',
    ...(clientId === signedInClientId
      ? [
          'You are signed in with this client. Deleting it signs you out, and you cannot sign in with it again.',
        ]
      : []),
  ];
}

/** What to confirm before a client's secret is replaced; it tells the caller signed in with it. */
function rotateConfirmation(clientId: string, signedInClientId?: string): string[] {
  return [
    'The current secret stops working at once, and so do tokens issued with it. With single sign-on (Keycloak), those tokens stay valid until they expire. Save the new secret: it is shown only once.',
    ...(clientId === signedInClientId
      ? [
          'You are signed in with this client. Your session continues with the new secret, which this browser does not store: once the session ends, you need the new secret to sign in again.',
        ]
      : []),
  ];
}

/**
 * Deletes a client and replaces its secret, after asking, for the list and the detail page. A
 * new secret is shown once through `secret`; deleting the client the caller signed in with signs
 * them out, and a new secret for it carries on their session.
 */
@Injectable()
export class ClientActions {
  private readonly session = inject(SessionService);
  private readonly caller = inject(CallerService).loadedCaller;
  private readonly router = inject(Router);
  private readonly notify = inject(NotifyService);
  private readonly confirm = inject(ConfirmService);
  private readonly queryClient = inject(QueryClient);
  private readonly instance = this.session.getBaseUrl();

  private readonly remove = injectMutation(() => deleteClientMutation());
  private readonly rotate = injectMutation(() => rotateSecretMutation());

  /** The credentials to show once after a secret was replaced; null while the dialog is closed. */
  readonly secret = signal<TenantClientCredentialsDto | null>(null);
  /** The client whose request runs, so its buttons can say so. */
  readonly busy = signal<string | null>(null);

  /** Whether the caller is signed in with `clientId`. */
  isOwn(clientId: string): boolean {
    return this.session.getClientId() === clientId;
  }

  /** Deletes `client` after asking; resolves true once it is deleted. */
  async delete(client: ClientEntity): Promise<boolean> {
    if (this.busy()) return false;
    const confirmed = await this.confirm.ask({
      title: `Delete client ${client.clientId}?`,
      description: deleteConfirmation(client.clientId, this.session.getClientId()),
      confirm: 'Delete client',
      destructive: true,
    });
    if (!confirmed) return false;
    this.busy.set(client.clientId);
    try {
      await this.remove.mutateAsync(client.clientId);
    } catch (error) {
      this.notify.error(getApiErrorMessage(error, 'Failed to delete the client'));
      return false;
    } finally {
      this.busy.set(null);
    }
    if (this.isOwn(client.clientId)) {
      // The deleted client can no longer renew this session.
      this.session.logout();
      this.queryClient.clear();
      this.notify.success('Client deleted. You have been signed out.');
      await this.router.navigate(['/login']);
      return true;
    }
    this.notify.success(`Client ${client.clientId} deleted.`);
    this.invalidate();
    return true;
  }

  /** Replaces the secret of `client` after asking, and shows the new one once. */
  async rotateSecret(client: ClientEntity): Promise<void> {
    if (this.busy()) return;
    const confirmed = await this.confirm.ask({
      title: `Replace the secret of ${client.clientId}?`,
      description: rotateConfirmation(client.clientId, this.session.getClientId()),
      confirm: 'Replace secret',
      destructive: true,
    });
    if (!confirmed) return;
    this.busy.set(client.clientId);
    let secret: string;
    try {
      secret = await this.rotate.mutateAsync(client.clientId);
    } catch (error) {
      this.notify.error(getApiErrorMessage(error, 'Failed to replace the client secret'));
      return;
    } finally {
      this.busy.set(null);
    }
    this.secret.set({ clientId: client.clientId, clientSecret: secret });
    if (this.isOwn(client.clientId)) {
      // The backend refuses the old secret's tokens, so the session moves to the new secret.
      try {
        await this.session.useRotatedSecret(secret);
      } catch {
        this.notify.error(
          'Your session could not continue with the new secret. Save it, then sign in again with it.'
        );
      }
    }
  }

  private invalidate(): void {
    void this.queryClient.invalidateQueries({
      queryKey: clientsKey(this.instance, this.caller()?.tenantId),
    });
  }
}
