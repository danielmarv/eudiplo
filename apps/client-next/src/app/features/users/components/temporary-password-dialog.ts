import { ChangeDetectionStrategy, Component, inject, input, output } from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideCopy, lucideKeyRound } from '@ng-icons/lucide';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import { HlmDialogImports } from '@spartan-ng/helm/dialog';
import { HlmTooltipImports } from '@spartan-ng/helm/tooltip';
import { NotifyService } from '../../../core/notify/notify.service';
import { copyText } from '../../../shared/clipboard/copy-text';

/** A new person's sign-in, shown once: the identity provider keeps no readable copy. */
export interface TemporaryLogin {
  username: string;
  temporaryPassword: string;
}

/**
 * Shows the temporary password of a new person once. It is open while `login` is set and closes
 * only by its button, so a stray click or Escape cannot lose the password. The person sets a new
 * password at the first sign-in.
 */
@Component({
  selector: 'app-temporary-password-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgIcon, HlmButtonImports, HlmDialogImports, HlmTooltipImports],
  providers: [provideIcons({ lucideCopy, lucideKeyRound })],
  template: `
    <hlm-dialog [state]="login() ? 'open' : 'closed'" disableClose>
      <hlm-dialog-content *hlmDialogPortal="let ctx" [showCloseButton]="false" class="sm:max-w-lg">
        <hlm-dialog-header>
          <span
            class="bg-warning/12 text-warning mb-1 grid size-11 place-items-center rounded-xl"
            aria-hidden="true"
          >
            <ng-icon name="lucideKeyRound" class="text-xl" />
          </span>
          <h2 hlmDialogTitle>Save the temporary password now</h2>
          <p hlmDialogDescription>
            This is the only time it is shown. Hand it to the person; they choose a new password
            when they first sign in.
          </p>
        </hlm-dialog-header>

        @if (login(); as current) {
          <dl class="grid gap-3">
            <div class="bg-muted/60 rounded-xl px-4 py-3">
              <dt class="text-muted-foreground text-xs font-medium">Username</dt>
              <dd class="mt-1 font-mono text-sm break-all">{{ current.username }}</dd>
            </div>
            <div class="bg-muted/60 rounded-xl px-4 py-3">
              <dt class="text-muted-foreground text-xs font-medium">Temporary password</dt>
              <dd class="mt-1 flex items-center justify-between gap-3">
                <span class="font-mono text-sm break-all">{{ current.temporaryPassword }}</span>
                <button
                  hlmBtn
                  variant="ghost"
                  size="icon-sm"
                  type="button"
                  aria-label="Copy the temporary password"
                  hlmTooltip="Copy password"
                  (click)="copy(current.temporaryPassword, 'Temporary password')"
                >
                  <ng-icon name="lucideCopy" />
                </button>
              </dd>
            </div>
          </dl>
        }

        <hlm-dialog-footer>
          <button hlmBtn variant="outline" type="button" (click)="copyBoth()">
            <ng-icon name="lucideCopy" aria-hidden="true" />
            Copy both
          </button>
          <button hlmBtn type="button" (click)="closed.emit()">I saved the password</button>
        </hlm-dialog-footer>
      </hlm-dialog-content>
    </hlm-dialog>
  `,
})
export class TemporaryPasswordDialog {
  private readonly notify = inject(NotifyService);

  readonly login = input<TemporaryLogin | null>(null);
  readonly closed = output<void>();

  protected copy(text: string, what: string): Promise<void> {
    return copyText(this.notify, text, what);
  }

  protected copyBoth(): Promise<void> {
    const login = this.login();
    if (!login) return Promise.resolve();
    return copyText(
      this.notify,
      `Username: ${login.username}\nTemporary password: ${login.temporaryPassword}`,
      'Username and password'
    );
  }
}
