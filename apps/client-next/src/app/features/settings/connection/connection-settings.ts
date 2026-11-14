import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { Router, RouterLink } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideCopy,
  lucideEye,
  lucideEyeOff,
  lucideLogOut,
  lucideMonitor,
  lucideServer,
  lucideTimer,
  lucideTriangleAlert,
} from '@ng-icons/lucide';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import { HlmSkeletonImports } from '@spartan-ng/helm/skeleton';
import { HlmTooltipImports } from '@spartan-ng/helm/tooltip';
import { injectQuery } from '@tanstack/angular-query-experimental';
import { interval, map } from 'rxjs';
import { CallerService } from '../../../core/auth/caller.service';
import { SessionService } from '../../../core/auth/session.service';
import {
  type BuildCompatibility,
  clientBuild,
  compareBuilds,
} from '../../../core/config/build-info';
import { type AuthMode, frontendConfigQuery } from '../../../core/config/frontend-config';
import { versionLabel, versionQuery } from '../../../core/config/version';
import { hostOf } from '../../../core/instance-url';
import { NotifyService } from '../../../core/notify/notify.service';
import { copyText } from '../../../shared/clipboard/copy-text';
import { timeLeft } from '../../../shared/format/duration';
import { PageHeader } from '../../../shared/pages/page-header';

/** Who issues the instance's access tokens, by its `authMode`. */
const AUTH_MODES: Record<AuthMode, string> = {
  builtin: 'the instance itself',
  keycloak: 'Keycloak',
  generic: 'an external identity provider',
};

/** What each startup import mode does (operate/configuration-as-code.md). */
const IMPORT_MODES: Record<string, { label: string; detail: string }> = {
  disabled: { label: 'Off', detail: 'Nothing is imported.' },
  create: { label: 'Create', detail: 'Creates missing resources, leaves existing ones untouched.' },
  upsert: { label: 'Upsert', detail: 'Creates missing and updates existing resources.' },
  replace: {
    label: 'Replace',
    detail: 'Like upsert, and deletes resources the folder created earlier but no longer contains.',
  },
};

/** The state of the link between this Web Client and the instance, as the page shows it. */
type LinkState = 'checking' | 'unreachable' | BuildCompatibility;

/**
 * The connection of this Web Client: the instance it is signed in to and whether both come from
 * the same build, who it is signed in as, and how long the session lasts and whether it renews
 * itself. Values can be copied; the client secret, which the page masks, only by its button.
 */
@Component({
  selector: 'app-connection-settings',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    NgIcon,
    HlmButtonImports,
    HlmSkeletonImports,
    HlmTooltipImports,
    PageHeader,
  ],
  providers: [
    provideIcons({
      lucideCopy,
      lucideEye,
      lucideEyeOff,
      lucideLogOut,
      lucideMonitor,
      lucideServer,
      lucideTimer,
      lucideTriangleAlert,
    }),
  ],
  templateUrl: './connection-settings.html',
})
export class ConnectionSettings {
  private readonly session = inject(SessionService);
  private readonly router = inject(Router);
  private readonly notify = inject(NotifyService);
  protected readonly caller = inject(CallerService).loadedCaller;

  protected readonly apiUrl = this.session.getBaseUrl();
  protected readonly host = hostOf(this.apiUrl);
  protected readonly oauthUrl = this.session.getoidcUrl();
  protected readonly clientId = this.session.getClientId();
  protected readonly secret = this.session.getClientSecret();
  protected readonly sso = this.session.usesSso();

  protected readonly version = injectQuery(() => versionQuery(this.apiUrl));
  protected readonly config = injectQuery(() => frontendConfigQuery(this.apiUrl));

  protected readonly client = clientBuild();
  protected readonly versionLabel = versionLabel;

  protected readonly link = computed<LinkState>(() => {
    if (this.version.isPending()) return 'checking';
    if (this.version.isError()) return 'unreachable';
    const backend = this.version.data();
    return backend ? compareBuilds(this.client, backend) : 'unknown';
  });

  protected readonly authMode = computed(() => {
    const mode = this.config.data()?.authMode;
    return mode ? AUTH_MODES[mode] : undefined;
  });
  protected readonly importMode = computed(() => {
    const mode = this.config.data()?.configImportMode;
    return mode ? (IMPORT_MODES[mode] ?? { label: mode, detail: '' }) : undefined;
  });
  protected readonly publicUrl = computed(() => this.config.data()?.publicUrl);

  /** Whether the caller may open its tenant's page. */
  protected readonly opensTenants = computed(
    () => this.caller()?.roles.includes('tenants:manage') ?? false
  );

  protected readonly showSecret = signal(false);

  /** Every second, so the time left and the renewal state stay current. */
  private readonly now = toSignal(interval(1000).pipe(map(() => Date.now())), {
    initialValue: Date.now(),
  });
  protected readonly timeLeft = computed(() => {
    this.now();
    return this.session.getTokenTimeRemaining();
  });
  protected readonly clock = computed(() => timeLeft(this.timeLeft()));
  protected readonly renews = computed(() => {
    this.now();
    return this.session.canRefreshToken();
  });
  protected readonly rejected = computed(() => {
    this.now();
    return this.session.areCredentialsRejected();
  });

  protected copy(text: string | undefined, what: string): void {
    if (text) void copyText(this.notify, text, what);
  }

  protected signOut(): void {
    // An SSO logout then leaves for the identity provider, which returns to the base URL.
    this.session.logout();
    void this.router.navigate(['/login']);
  }
}
