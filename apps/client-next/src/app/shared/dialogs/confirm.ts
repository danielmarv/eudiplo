import { ChangeDetectionStrategy, Component, inject, Injectable } from '@angular/core';
import { BrnDialogRef, injectBrnDialogContext } from '@spartan-ng/brain/dialog';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import { HlmDialogImports, HlmDialogService } from '@spartan-ng/helm/dialog';
import { firstValueFrom } from 'rxjs';

/** What a confirmation asks, and the name of the action it confirms. */
export interface ConfirmOptions {
  title: string;
  /** One paragraph per entry. */
  description: string | string[];
  /** The action, such as "Delete trust list". */
  confirm: string;
  /** Shows the action in the destructive style, for a deletion. */
  destructive?: boolean;
}

@Component({
  selector: 'app-confirm-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [HlmButtonImports, HlmDialogImports],
  host: { class: 'grid gap-4' },
  template: `
    <hlm-dialog-header>
      <h2 hlmDialogTitle>{{ options.title }}</h2>
      <div hlmDialogDescription class="grid gap-2">
        @for (paragraph of paragraphs; track $index) {
          <p>{{ paragraph }}</p>
        }
      </div>
    </hlm-dialog-header>
    <hlm-dialog-footer>
      <button hlmBtn variant="outline" type="button" (click)="ref.close(false)">Cancel</button>
      <button
        hlmBtn
        type="button"
        [variant]="options.destructive ? 'destructive' : 'default'"
        (click)="ref.close(true)"
      >
        {{ options.confirm }}
      </button>
    </hlm-dialog-footer>
  `,
})
class ConfirmDialog {
  protected readonly options = injectBrnDialogContext<ConfirmOptions>();
  protected readonly ref = inject<BrnDialogRef<boolean>>(BrnDialogRef);
  protected readonly paragraphs = [this.options.description].flat();
}

/**
 * Asks before an action that cannot be undone, in an alert dialog of the app instead of the
 * browser's `confirm()`: it names the action, reads to screen readers and follows the theme.
 */
@Injectable({ providedIn: 'root' })
export class ConfirmService {
  private readonly dialogs = inject(HlmDialogService);

  /** Resolves true when the user chose the action, false on Cancel, Escape or a click outside. */
  ask(options: ConfirmOptions): Promise<boolean> {
    const ref = this.dialogs.open<boolean, ConfirmOptions>(ConfirmDialog, {
      context: options,
      role: 'alertdialog',
      showCloseButton: false,
      contentClass: 'sm:max-w-lg',
    });
    return firstValueFrom(ref.closed$).then((result) => result === true);
  }
}
