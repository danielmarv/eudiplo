import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  type ElementRef,
  inject,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideBookOpen,
  lucideChevronRight,
  lucideChevronsUpDown,
  lucideCircleHelp,
  lucideCodeXml,
  lucideCopy,
  lucideExternalLink,
  lucideLogIn,
  lucideLogOut,
  lucideMessagesSquare,
  lucideMoon,
  lucideSearch,
  lucideSun,
  lucideTriangleAlert,
  lucideX,
} from '@ng-icons/lucide';
import type { BrnDialogState } from '@spartan-ng/brain/dialog';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import { HlmDropdownMenuImports } from '@spartan-ng/helm/dropdown-menu';
import { HlmSidebarImports, HlmSidebarService } from '@spartan-ng/helm/sidebar';
import { HlmTooltipImports } from '@spartan-ng/helm/tooltip';
import { injectQuery } from '@tanstack/angular-query-experimental';
import { filter, map, startWith } from 'rxjs';
import { CallerService } from '../../core/auth/caller.service';
import { RoleChangeService } from '../../core/auth/role-change.service';
import { TokenExpiryService } from '../../core/auth/token-expiry.service';
import { type Role, TENANT_ADMIN_ROLES } from '../../core/auth/role-grants';
import { SessionService } from '../../core/auth/session.service';
import {
  frontendConfigQuery,
  managesClients,
  managesUsers,
} from '../../core/config/frontend-config';
import { clientBuild, compareBuilds } from '../../core/config/build-info';
import { ThemeService } from '../../core/config/theme.service';
import { versionLabel, versionQuery } from '../../core/config/version';
import { NotifyService } from '../../core/notify/notify.service';
import { DiploLogo } from '../../shared/brand/diplo-logo';
import { CommandPalette } from '../command-palette';
import { NavGroups } from '../nav-groups';
import { NAV_ICONS, visibleNavigation } from '../navigation';

/** A step of the breadcrumb: the section, then the page. */
interface Crumb {
  readonly label: string;
  readonly path?: string;
}

/**
 * The frame of every page after sign-in: the navigation in the sidebar, which collapses to
 * icons on a desktop and becomes a drawer on a phone; a header with the breadcrumb, the page
 * search (⌘K), the state of the instance and help; and the account menu at the sidebar's foot.
 */
@Component({
  selector: 'app-shell',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    NgIcon,
    HlmSidebarImports,
    HlmButtonImports,
    HlmDropdownMenuImports,
    HlmTooltipImports,
    DiploLogo,
    CommandPalette,
  ],
  providers: [
    provideIcons({
      ...NAV_ICONS,
      lucideBookOpen,
      lucideChevronRight,
      lucideChevronsUpDown,
      lucideCircleHelp,
      lucideCodeXml,
      lucideCopy,
      lucideExternalLink,
      lucideLogIn,
      lucideLogOut,
      lucideMessagesSquare,
      lucideMoon,
      lucideSearch,
      lucideSun,
      lucideTriangleAlert,
      lucideX,
    }),
  ],
  host: { '(document:keydown)': 'onKeydown($event)' },
  templateUrl: './shell.html',
})
export class Shell {
  private readonly session = inject(SessionService);
  private readonly callers = inject(CallerService);
  private readonly router = inject(Router);
  protected readonly theme = inject(ThemeService);
  private readonly notify = inject(NotifyService);

  private readonly mainContent = viewChild.required<ElementRef<HTMLElement>>('mainContent');

  /** The instance this session belongs to; signing in elsewhere opens a new shell. */
  protected readonly instanceUrl = this.session.getBaseUrl();
  protected readonly instanceHost = hostOf(this.instanceUrl);
  private readonly clientId = this.session.getClientId();

  private readonly frontendConfig = injectQuery(() => frontendConfigQuery(this.instanceUrl));
  protected readonly version = injectQuery(() => versionQuery(this.instanceUrl));
  protected readonly versionLabel = computed(() => versionLabel(this.version.data()?.version));
  protected readonly clientVersion = clientBuild().version;
  /** Whether this client and the backend come from different builds; then features may break. */
  protected readonly versionMismatch = computed(() => {
    const backend = this.version.data();
    if (!backend?.version) return false;
    return (
      compareBuilds(clientBuild(), {
        version: backend.version,
        revision: (backend as { revision?: string }).revision || undefined,
      }) === 'mismatch'
    );
  });
  protected readonly versionWarningDismissed = signal(false);

  protected readonly caller = this.callers.loadedCaller;

  protected readonly navigation = computed(() => {
    const caller = this.caller();
    const roles = caller?.roles ?? [];
    const hasRole = (wanted: Role | Role[]) =>
      (Array.isArray(wanted) ? wanted : [wanted]).some((role) => roles.includes(role));
    const authMode = this.frontendConfig.data()?.authMode;
    return visibleNavigation({
      hasRole,
      managesUsers: managesUsers(authMode),
      managesClients: managesClients(authMode),
      canUseConfigPortability: !!caller?.tenantId && hasRole(TENANT_ADMIN_ROLES),
    });
  });

  private readonly url = toSignal(
    this.router.events.pipe(
      filter((event): event is NavigationEnd => event instanceof NavigationEnd),
      map((event) => event.urlAfterRedirects),
      startWith(this.router.url)
    ),
    { initialValue: this.router.url }
  );

  /** Where the current page sits: its section and its name, from the navigation. */
  private readonly path = computed(() => this.url().split(/[?#]/)[0]);

  /** The entry of the current page: the one whose path is the longest prefix of the address. */
  private readonly current = computed(() => {
    const path = this.path();
    let best: { group: string; label: string; path: string } | undefined;
    for (const group of this.navigation()) {
      for (const item of group.items) {
        const matches = path === item.path || path.startsWith(`${item.path}/`);
        if (matches && item.path.length > (best?.path.length ?? 0)) {
          best = { group: group.label, label: item.label, path: item.path };
        }
      }
    }
    return best;
  });

  /** Where the current page sits: its section and its name, from the navigation. */
  protected readonly crumbs = computed<Crumb[]>(() => {
    const best = this.current();
    if (!best) return [];
    if (best.group === 'Overview') return [{ label: best.label }];
    const crumbs: Crumb[] = [{ label: best.group }, { label: best.label, path: best.path }];
    if (this.path() !== best.path) {
      crumbs.push({
        label: this.path().endsWith('/create')
          ? 'New'
          : this.path().endsWith('/edit')
            ? 'Edit'
            : this.path().endsWith('/config')
              ? 'Settings'
              : 'Details',
      });
    }
    return crumbs;
  });

  private readonly sidebar = inject(HlmSidebarService);
  private readonly navGroups = inject(NavGroups);
  /** Collapsed to icons on a large screen: every group shows its icons, none can be closed. */
  private readonly iconsOnly = computed(
    () => this.sidebar.state() === 'collapsed' && !this.sidebar.isMobile()
  );

  /** Whether a group shows its entries. */
  protected groupOpen(label: string): boolean {
    return this.iconsOnly() || !this.navGroups.isClosed(label);
  }

  protected toggleGroup(label: string): void {
    this.navGroups.toggle(label);
  }

  /** The ID of a group's list, for the aria-controls of its toggle. */
  protected groupId(label: string): string {
    return `nav-group-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
  }

  /** Who is signed in: the caller's subject once loaded, else the client the session started with. */
  protected readonly accountName = computed(
    () => this.caller()?.subject ?? this.clientId ?? 'Signed in'
  );

  /** "Tenant acme, v3.4.0" or "All tenants, main", for the workspace menu. */
  protected readonly workspaceDetail = computed(() => {
    const tenant = this.caller()?.tenantId;
    const scope = tenant ? `Tenant ${tenant}` : 'All tenants';
    const version = this.versionLabel();
    return version ? `${scope}, ${version}` : scope;
  });

  /** The caller's only role, shown as its ID; several are counted instead. */
  protected readonly singleRole = computed(() => {
    const roles = this.caller()?.roles ?? [];
    return roles.length === 1 ? roles[0] : undefined;
  });

  protected readonly roleCount = computed(() => this.caller()?.roles.length ?? 0);

  protected readonly initials = computed(
    () =>
      this.accountName()
        .split(/[\s_-]+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part[0])
        .join('')
        .toUpperCase() || '?'
  );

  protected readonly apiReference = this.instanceUrl ? `${this.instanceUrl}/api/docs` : undefined;

  protected readonly palette = signal<BrnDialogState>('closed');
  /** ⌘K on a Mac, Ctrl K elsewhere. */
  protected readonly shortcut = /Mac|iPhone|iPad/.test(globalThis.navigator?.platform ?? '')
    ? '⌘K'
    : 'Ctrl K';

  constructor() {
    // Expiring sessions, lost access and lost roles are reported on every page.
    const tokenExpiry = inject(TokenExpiryService);
    const roleChange = inject(RoleChangeService);
    tokenExpiry.start();
    roleChange.start();
    inject(DestroyRef).onDestroy(() => {
      tokenExpiry.stop();
      roleChange.stop();
    });
    // Opening a page opens its group, also one the user closed before.
    effect(() => {
      const group = this.current()?.group;
      if (group) untracked(() => this.navGroups.open(group));
    });
  }

  protected onKeydown(event: KeyboardEvent): void {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
      event.preventDefault();
      this.palette.update((state) => (state === 'open' ? 'closed' : 'open'));
    }
  }

  /**
   * Moves focus to the main content. The link's own fragment would resolve against
   * `<base href>` and leave the current page, so it is not followed.
   */
  protected skipToMainContent(event: Event): void {
    event.preventDefault();
    this.mainContent().nativeElement.focus();
  }

  /** Copies the address of the instance, for example to share it or to sign in elsewhere. */
  protected async copyInstanceUrl(): Promise<void> {
    if (!this.instanceUrl) return;
    try {
      await globalThis.navigator.clipboard.writeText(this.instanceUrl);
      this.notify.success('Instance address copied.');
    } catch {
      this.notify.error(`Could not copy the address. It is ${this.instanceUrl}.`);
    }
  }

  protected logout(): void {
    // An SSO logout then leaves for the identity provider, which returns to the base URL.
    this.session.logout();
    void this.router.navigate(['/login']);
  }
}

function hostOf(url: string | undefined): string {
  if (!url) return '';
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}
