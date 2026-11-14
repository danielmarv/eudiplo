import { ChangeDetectionStrategy, Component, inject, input, model, output } from '@angular/core';
import { Router } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideBookOpen, lucideLogOut, lucideMoon, lucideSun } from '@ng-icons/lucide';
import type { BrnDialogState } from '@spartan-ng/brain/dialog';
import { HlmCommandImports } from '@spartan-ng/helm/command';
import { ThemeService } from '../core/config/theme.service';
import type { NavGroup } from './navigation';

/**
 * Search the pages the caller may open, and a few actions, from the keyboard (⌘K or Ctrl+K)
 * or the search box in the header. It lists the same entries as the sidebar, so a page the
 * roles do not include is not offered here either.
 */
@Component({
  selector: 'app-command-palette',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [HlmCommandImports, NgIcon],
  providers: [provideIcons({ lucideBookOpen, lucideLogOut, lucideMoon, lucideSun })],
  template: `
    <hlm-command-dialog
      [state]="state()"
      (stateChange)="state.set($event)"
      title="Go to a page"
      description="Search the pages of the Web Client and run an action."
      dialogContentClass="w-[calc(100vw-2rem)] sm:max-w-xl"
    >
      <hlm-command>
        <hlm-command-input placeholder="Search pages and actions…" />
        <div *hlmCommandEmptyState hlmCommandEmpty>No page or action matches.</div>
        <hlm-command-list class="max-h-[min(26rem,60vh)]">
          @for (group of navigation(); track group.label) {
            <hlm-command-group>
              <hlm-command-group-label>{{ group.label }}</hlm-command-group-label>
              @for (item of group.items; track item.path) {
                <button
                  hlmCommandItem
                  [value]="group.label + ' ' + item.label"
                  (selected)="go(item.path)"
                >
                  <ng-icon [name]="item.icon" />
                  {{ item.label }}
                </button>
              }
            </hlm-command-group>
          }
          <hlm-command-group>
            <hlm-command-group-label>Actions</hlm-command-group-label>
            <button hlmCommandItem value="Theme dark light mode" (selected)="toggleTheme()">
              <ng-icon [name]="theme.darkMode() ? 'lucideSun' : 'lucideMoon'" />
              {{ theme.darkMode() ? 'Switch to light mode' : 'Switch to dark mode' }}
            </button>
            <button hlmCommandItem value="Documentation help guide" (selected)="openDocs()">
              <ng-icon name="lucideBookOpen" />
              Open the documentation
            </button>
            <button hlmCommandItem value="Log out sign out" (selected)="choose(logout)">
              <ng-icon name="lucideLogOut" />
              Log out
            </button>
          </hlm-command-group>
        </hlm-command-list>
      </hlm-command>
    </hlm-command-dialog>
  `,
})
export class CommandPalette {
  private readonly router = inject(Router);
  protected readonly theme = inject(ThemeService);

  readonly navigation = input.required<readonly NavGroup[]>();
  readonly state = model<BrnDialogState>('closed');
  /** The caller chose to log out; the shell does it. */
  readonly logout = output<void>();

  protected go(path: string): void {
    this.state.set('closed');
    void this.router.navigateByUrl(path);
  }

  protected toggleTheme(): void {
    this.state.set('closed');
    this.theme.toggle();
  }

  protected openDocs(): void {
    this.state.set('closed');
    globalThis.open('https://docs.eudiplo.dev/', '_blank', 'noopener');
  }

  protected choose(event: { emit: () => void }): void {
    this.state.set('closed');
    event.emit();
  }
}
