import { provideHttpClient, withFetch } from '@angular/common/http';
import {
  type ApplicationConfig,
  inject,
  Injectable,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
  provideZonelessChangeDetection,
} from '@angular/core';
import { Title } from '@angular/platform-browser';
import {
  provideRouter,
  type RouterStateSnapshot,
  TitleStrategy,
  withComponentInputBinding,
} from '@angular/router';
import { provideHlmSidebarConfig } from '@spartan-ng/helm/sidebar';
import { provideSpartanHlm } from '@spartan-ng/helm/utils';
import { provideTanStackQuery, QueryClient } from '@tanstack/angular-query-experimental';
import { routes } from './app.routes';
import { OidcService } from './core/auth/oidc.service';
import { SessionService } from './core/auth/session.service';

const SIDEBAR_COOKIE = 'eudiplo_sidebar';

/**
 * Whether the sidebar starts expanded: as the user left it. The sidebar writes its state to a
 * cookie on every change but does not read it back, so this does.
 */
function sidebarWasOpen(): boolean {
  const match = new RegExp(`(?:^|; )${SIDEBAR_COOKIE}=(true|false)`).exec(
    globalThis.document?.cookie ?? ''
  );
  return match?.[1] !== 'false';
}

/** "Dashboard – EUDIPLO": the page first, so a row of browser tabs stays readable. */
@Injectable()
class PageTitleStrategy extends TitleStrategy {
  private readonly title = inject(Title);

  override updateTitle(snapshot: RouterStateSnapshot): void {
    const page = this.buildTitle(snapshot);
    this.title.setTitle(page ? `${page} – EUDIPLO` : 'EUDIPLO');
  }
}

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZonelessChangeDetection(),
    provideRouter(routes, withComponentInputBinding()),
    { provide: TitleStrategy, useClass: PageTitleStrategy },
    // Only for the discovery document; every API call goes through @eudiplo/sdk-core.
    provideHttpClient(withFetch()),
    provideTanStackQuery(
      new QueryClient({
        defaultOptions: {
          queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: false },
        },
      })
    ),
    provideSpartanHlm(),
    provideHlmSidebarConfig({
      defaultOpen: sidebarWasOpen(),
      sidebarCookieName: SIDEBAR_COOKIE,
      // On a phone the drawer covers the page; it closes once an entry is chosen.
      closeMobileSidebarOnMenuButtonClick: true,
    }),
    provideAppInitializer(async () => {
      // Both before the first await, which ends the injection context.
      const oidc = inject(OidcService);
      const session = inject(SessionService);
      await oidc.initialize();
      // The page reload after the identity provider's redirect resets the API base URL,
      // so re-apply the one the OIDC session was started with.
      session.syncWithOidcSession();
    }),
  ],
};
