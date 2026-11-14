import { ChangeDetectionStrategy, Component, inject, input, output } from '@angular/core';
import { Router } from '@angular/router';
import type { TenantClientCredentialsDto } from '@eudiplo/sdk-core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideCopy, lucideKeyRound, lucideLogIn } from '@ng-icons/lucide';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import { HlmDialogImports } from '@spartan-ng/helm/dialog';
import { HlmTooltipImports } from '@spartan-ng/helm/tooltip';
import { QueryClient } from '@tanstack/angular-query-experimental';
import { SessionService } from '../../../core/auth/session.service';
import { signInAs } from '../../../core/auth/sign-in-as';
import { NotifyService } from '../../../core/notify/notify.service';
import { copyText } from '../../../shared/clipboard/copy-text';

/**
 * Shows the ID and secret of a client the backend just created, once: the backend keeps only a
 * hash of the secret. It is open while `credentials` is set and closes only by its buttons, so
 * a stray click or Escape cannot lose the secret. The user can also sign in as the client at
 * once, to set up what it belongs to, which ends the current session.
 */
@Component({
  selector: 'app-client-secret-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgIcon, HlmButtonImports, HlmDialogImports, HlmTooltipImports],
  providers: [provideIcons({ lucideCopy, lucideKeyRound, lucideLogIn })],
  template: `
    <hlm-dialog [state]="credentials() ? 'open' : 'closed'" disableClose>
      <hlm-dialog-content *hlmDialogPortal="let ctx" [showCloseButton]="false" class="sm:max-w-lg">
        <hlm-dialog-header>
          <span
            class="bg-warning/12 text-warning mb-1 grid size-11 place-items-center rounded-xl"
            aria-hidden="true"
          >
            <ng-icon name="lucideKeyRound" class="text-xl" />
          </span>
          <h2 hlmDialogTitle>Save the client secret now</h2>
          <p hlmDialogDescription>
            This is the only time it is shown. Keep it in a password manager or secret store. If it
            is lost, rotate the client's secret to get a new one.
          </p>
        </hlm-dialog-header>

        @if (credentials(); as client) {
          <dl class="grid gap-3">
            <div class="bg-muted/60 rounded-xl px-4 py-3">
              <dt class="text-muted-foreground text-xs font-medium">Client ID</dt>
              <dd class="mt-1 flex items-center justify-between gap-3">
                <span class="font-mono text-sm break-all">{{ client.clientId }}</span>
                <button
                  hlmBtn
                  variant="ghost"
                  size="icon-sm"
                  type="button"
                  aria-label="Copy client ID"
                  hlmTooltip="Copy client ID"
                  (click)="copy(client.clientId, 'Client ID')"
                >
                  <ng-icon name="lucideCopy" />
                </button>
              </dd>
            </div>
            <div class="bg-muted/60 rounded-xl px-4 py-3">
              <dt class="text-muted-foreground text-xs font-medium">Client secret</dt>
              <dd class="mt-1 flex items-center justify-between gap-3">
                <span class="font-mono text-sm break-all">{{ client.clientSecret }}</span>
                <button
                  hlmBtn
                  variant="ghost"
                  size="icon-sm"
                  type="button"
                  aria-label="Copy client secret"
                  hlmTooltip="Copy client secret"
                  (click)="copy(client.clientSecret, 'Client secret')"
                >
                  <ng-icon name="lucideCopy" />
                </button>
              </dd>
            </div>
          </dl>
        }

        @if (canSignIn) {
          <p class="text-muted-foreground text-sm" id="sign-in-as-hint">
            Signing in as this client ends your session as {{ signedInAs }}. To come back, sign in
            with that client again.
          </p>
        }

        <hlm-dialog-footer>
          <button hlmBtn variant="outline" type="button" (click)="copyBoth()">
            <ng-icon name="lucideCopy" aria-hidden="true" />
            Copy both
          </button>
          @if (canSignIn) {
            <button
              hlmBtn
              variant="outline"
              type="button"
              aria-describedby="sign-in-as-hint"
              (click)="signIn()"
            >
              <ng-icon name="lucideLogIn" aria-hidden="true" />
              Sign in as this client
            </button>
          }
          <button hlmBtn type="button" (click)="closed.emit()">I saved the secret</button>
        </hlm-dialog-footer>
      </hlm-dialog-content>
    </hlm-dialog>
  `,
})
export class ClientSecretDialog {
  private readonly notify = inject(NotifyService);
  private readonly session = inject(SessionService);
  private readonly router = inject(Router);
  private readonly queryClient = inject(QueryClient);

  /**
   * Whether the user can switch to the new client here. Not after a single sign-on: its logout
   * leaves for the identity provider, and the hand-over to the login page would be lost.
   */
  protected readonly canSignIn = !this.session.usesSso() && !!this.session.getBaseUrl();
  protected readonly signedInAs = this.session.getClientId() ?? 'the current client';

  readonly credentials = input<TenantClientCredentialsDto | null>(null);
  readonly closed = output<void>();

  protected copy(text: string, what: string): Promise<void> {
    return copyText(this.notify, text, what);
  }

  protected copyBoth(): Promise<void> {
    const client = this.credentials();
    if (!client) return Promise.resolve();
    return copyText(
      this.notify,
      `Client ID: ${client.clientId}\nClient secret: ${client.clientSecret}`,
      'Client ID and secret'
    );
  }

  /**
   * Signs out and signs in as the new client at the same instance, through the login page, as
   * the current Web Client does. The data of the session that ends leaves the cache, so the new
   * client never sees what only the old one could load.
   */
  protected async signIn(): Promise<void> {
    const client = this.credentials();
    const apiUrl = this.session.getBaseUrl();
    if (!client || !apiUrl) return;
    // The login page then does not ask about the instance the user is signed in to.
    this.session.rememberSignedInInstance(apiUrl);
    this.session.logout();
    await signInAs(this.router, {
      clientId: client.clientId,
      clientSecret: client.clientSecret,
      apiUrl,
    });
    this.queryClient.clear();
  }
}
