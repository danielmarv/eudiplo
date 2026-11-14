import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { HlmToasterImports } from '@spartan-ng/helm/sonner';
import { ThemeService } from './core/config/theme.service';

/** The root: the routed page and the notices of the whole app. */
@Component({
  selector: 'app-root',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet, HlmToasterImports],
  template: `
    <router-outlet />
    <hlm-toaster
      closeButton
      position="bottom-right"
      [theme]="theme.darkMode() ? 'dark' : 'light'"
    />
  `,
})
export class App {
  protected readonly theme = inject(ThemeService);
}
