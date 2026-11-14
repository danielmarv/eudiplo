import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import type { Session, SessionTypeStatsDto } from '@eudiplo/sdk-core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideActivity,
  lucideArrowRight,
  lucideBuilding2,
  lucideCirclePlus,
  lucideFileCheck,
  lucideGlobe,
  lucideIdCard,
  lucideImport,
  lucideKey,
  lucideKeyRound,
  lucideMonitorSmartphone,
  lucidePackage,
  lucidePlug,
  lucidePlus,
  lucideScanLine,
  lucideTag,
} from '@ng-icons/lucide';
import { HlmBadgeImports } from '@spartan-ng/helm/badge';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import { HlmSkeletonImports } from '@spartan-ng/helm/skeleton';
import { injectQuery } from '@tanstack/angular-query-experimental';
import { CallerService } from '../../core/auth/caller.service';
import type { Role } from '../../core/auth/role-grants';
import { SessionService } from '../../core/auth/session.service';
import { frontendConfigQuery } from '../../core/config/frontend-config';
import { versionLabel, versionQuery } from '../../core/config/version';
import { KEY_CHAIN_ROLES } from '../../layout/navigation';
import { initialsOf, monogramGradient } from '../../shared/brand/monogram';
import { duration } from '../../shared/format/duration';
import { relativeTime } from '../../shared/format/relative-time';
import { credentialConfigsQuery } from '../issuance/data/issuance-queries';
import { tenantsQuery } from '../tenants/data/tenant-queries';
import { ActivityChart } from './components/activity-chart';
import { FailureReasons } from './components/failure-reasons';
import { SessionOutcomes } from './components/session-outcomes';
import { type StatPart, StatTile, type StatTone } from './components/stat-tile';
import { WelcomeHero } from './components/welcome-hero';
import {
  presentationConfigsQuery,
  recentSessionsQuery,
  sessionStatsQuery,
} from './data/dashboard-queries';
import {
  ACTIVITY_RANGES,
  type ActivityRange,
  rangeHasHistory,
  type SessionKind,
  sessionActivityQuery,
  totalsOf,
} from './data/session-activity';

/** Roles that read sessions and their counts, as the backend checks them. */
const SESSION_READER_ROLES: Role[] = ['issuance:offer', 'presentation:request', 'sessions:read'];

interface QuickAction {
  readonly title: string;
  readonly description: string;
  readonly path: string;
  readonly icon: string;
  readonly tone: StatTone;
  /** Shown when the caller has one of them; every caller sees an action without roles. */
  readonly roles: Role[];
}

/** The actions the dashboard offers, most specific first; the first four the caller may use show. */
const QUICK_ACTIONS: readonly QuickAction[] = [
  {
    title: 'Issue a credential',
    description: 'Create an offer that a wallet scans.',
    path: '/offer/issuance',
    icon: 'lucideCirclePlus',
    tone: 'blue',
    roles: ['issuance:offer'],
  },
  {
    title: 'Request a presentation',
    description: 'Ask a wallet to prove something.',
    path: '/offer/presentation',
    icon: 'lucideScanLine',
    tone: 'teal',
    roles: ['presentation:request'],
  },
  {
    title: 'Add a tenant',
    description: 'An organization with its own clients and keys.',
    path: '/tenants/create',
    icon: 'lucidePlus',
    tone: 'blue',
    roles: ['tenants:manage'],
  },
  {
    title: 'All tenants',
    description: 'Their clients, keys and settings.',
    path: '/tenants',
    icon: 'lucideBuilding2',
    tone: 'teal',
    roles: ['tenants:manage'],
  },
  {
    title: 'Credential types',
    description: 'What your issuer offers.',
    path: '/credential-config',
    icon: 'lucideIdCard',
    tone: 'amber',
    roles: ['issuance:manage'],
  },
  {
    title: 'Verification configs',
    description: 'What you ask wallets for.',
    path: '/presentation-config',
    icon: 'lucideFileCheck',
    tone: 'green',
    roles: ['presentation:manage'],
  },
  {
    title: 'Keys',
    description: 'The keys and certificates you sign with.',
    path: '/keys',
    icon: 'lucideKey',
    tone: 'amber',
    roles: KEY_CHAIN_ROLES,
  },
  {
    title: 'Connection settings',
    description: 'This session, its token and client.',
    path: '/settings/connection',
    icon: 'lucidePlug',
    tone: 'green',
    roles: [],
  },
];

const ACTION_TILES: Record<StatTone, string> = {
  blue: 'bg-[linear-gradient(135deg,#6b74ff,#343dff)] shadow-[0_10px_22px_-10px_rgba(52,61,255,0.9)]',
  teal: 'bg-[linear-gradient(135deg,#14a594,#0a5560)] shadow-[0_10px_22px_-10px_rgba(15,140,126,0.9)]',
  amber:
    'bg-[linear-gradient(135deg,#f5a05c,#b5611c)] shadow-[0_10px_22px_-10px_rgba(181,97,28,0.9)]',
  green:
    'bg-[linear-gradient(135deg,#5cbf60,#2e7d32)] shadow-[0_10px_22px_-10px_rgba(46,125,50,0.9)]',
};

const AUTH_MODES: Record<string, string> = {
  builtin: 'Built-in sign-in',
  keycloak: 'Keycloak',
  generic: 'OpenID Connect',
};

const IMPORT_MODES: Record<string, string> = {
  disabled: 'Off',
  create: 'Create only',
  upsert: 'Create and update',
  replace: 'Replace',
};

const SESSION_STATUS: Record<Session['status'], { label: string; classes: string }> = {
  active: { label: 'Waiting for wallet', classes: 'bg-primary/10 text-primary' },
  fetched: { label: 'Wallet connected', classes: 'bg-primary/10 text-primary' },
  completed: { label: 'Completed', classes: 'bg-success/12 text-success' },
  failed: { label: 'Failed', classes: 'bg-destructive/10 text-destructive' },
  expired: { label: 'Expired', classes: 'bg-muted text-muted-foreground' },
  cancelled: { label: 'Cancelled', classes: 'bg-muted text-muted-foreground' },
};

/** The first page after sign-in: who is signed in where, what happened, and where to go next. */
@Component({
  selector: 'app-dashboard',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    NgIcon,
    HlmBadgeImports,
    HlmButtonImports,
    HlmSkeletonImports,
    StatTile,
    WelcomeHero,
    ActivityChart,
    SessionOutcomes,
    FailureReasons,
  ],
  providers: [
    provideIcons({
      lucideActivity,
      lucideArrowRight,
      lucideBuilding2,
      lucideCirclePlus,
      lucideFileCheck,
      lucideGlobe,
      lucideIdCard,
      lucideImport,
      lucideKey,
      lucideKeyRound,
      lucideMonitorSmartphone,
      lucidePackage,
      lucidePlug,
      lucidePlus,
      lucideScanLine,
      lucideTag,
    }),
  ],
  templateUrl: './dashboard.html',
})
export class Dashboard {
  private readonly session = inject(SessionService);
  protected readonly caller = inject(CallerService).loadedCaller;

  protected readonly instanceUrl = this.session.getBaseUrl();
  protected readonly instanceHost = hostOf(this.instanceUrl);
  /** The start of the window the session counts cover; fixed, so the query key stays the same. */
  private readonly since = new Date(Date.now() - 24 * 3600_000).toISOString();

  private readonly roles = computed(() => this.caller()?.roles ?? []);
  protected readonly tenantId = computed(() => this.caller()?.tenantId ?? null);
  protected readonly managesTenants = computed(() => this.hasRole('tenants:manage'));
  protected readonly readsSessions = computed(
    () => !!this.tenantId() && this.hasRole(...SESSION_READER_ROLES)
  );
  protected readonly managesIssuance = computed(
    () => !!this.tenantId() && this.hasRole('issuance:manage')
  );
  protected readonly managesPresentation = computed(
    () => !!this.tenantId() && this.hasRole('presentation:manage')
  );

  protected readonly version = injectQuery(() => versionQuery(this.instanceUrl));
  protected readonly config = injectQuery(() => frontendConfigQuery(this.instanceUrl));
  protected readonly tenants = injectQuery(() =>
    tenantsQuery(this.instanceUrl, this.managesTenants())
  );
  protected readonly stats = injectQuery(() =>
    sessionStatsQuery(this.instanceUrl, this.tenantId(), this.since, this.readsSessions())
  );
  protected readonly recentSessions = injectQuery(() =>
    recentSessionsQuery(this.instanceUrl, this.tenantId(), this.readsSessions())
  );
  /** The period the activity charts cover; the user picks it above them. */
  protected readonly activityRange = signal<ActivityRange>(ACTIVITY_RANGES[0].value);
  protected readonly activity = injectQuery(() =>
    sessionActivityQuery(
      this.instanceUrl,
      this.tenantId(),
      this.activityRange(),
      this.readsSessions()
    )
  );
  protected readonly activityBuckets = computed(() => this.activity.data()?.buckets ?? []);
  /** The kinds of session the caller can read: the backend leaves out the others. */
  protected readonly activityKinds = computed(() =>
    (['issuance', 'presentation'] as const satisfies readonly SessionKind[]).filter((kind) =>
      this.activityBuckets().some((bucket) => bucket[kind])
    )
  );
  protected readonly activityTotals = computed(() => ({
    issuance: totalsOf(this.activityBuckets(), 'issuance'),
    presentation: totalsOf(this.activityBuckets(), 'presentation'),
  }));
  /** Whether the charts show older data while the newly chosen period loads. */
  protected readonly activityRefreshing = computed(
    () =>
      this.activity.isPlaceholderData() ||
      (this.activity.isFetching() && !this.activity.isPending())
  );
  private readonly retention = computed(
    () => this.activity.data()?.retention ?? this.stats.data()?.retention
  );
  protected readonly activityRanges = computed(() =>
    ACTIVITY_RANGES.map((range) => ({
      ...range,
      available: rangeHasHistory(range.value, this.retention()),
    }))
  );
  /** Why a longer period is not offered: the backend deletes sessions after a while. */
  protected readonly retentionNote = computed(() => {
    const retention = this.retention();
    if (retention?.cleanupMode !== 'full') {
      return 'How the sessions of this tenant went in the period you choose.';
    }
    return `Sessions are deleted ${duration(retention.ttlSeconds)} after they start, so the charts reach back no further.`;
  });

  protected readonly credentialConfigs = injectQuery(() =>
    credentialConfigsQuery(this.instanceUrl, this.tenantId(), this.managesIssuance())
  );
  protected readonly presentationConfigs = injectQuery(() =>
    presentationConfigsQuery(this.instanceUrl, this.tenantId(), this.managesPresentation())
  );

  constructor() {
    // A period the backend keeps no history for falls back to the shortest one.
    effect(() => {
      const chosen = this.activityRanges().find((range) => range.value === this.activityRange());
      if (chosen && !chosen.available) this.activityRange.set(ACTIVITY_RANGES[0].value);
    });
  }

  protected readonly greeting = computed(() => {
    const hour = new Date().getHours();
    const part = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
    const name = this.caller()?.subject;
    return name ? `${part}, ${name}` : part;
  });

  protected readonly today = new Intl.DateTimeFormat('en', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(new Date());

  protected readonly summary = computed(() => {
    const tenant = this.tenantId();
    if (tenant && this.readsSessions()) {
      return `Here is what happened on ${tenant} in the last 24 hours.`;
    }
    if (tenant) return `You work on ${tenant} on this instance.`;
    if (this.managesTenants()) {
      const count = this.tenants.data()?.length;
      return count === undefined
        ? 'You manage the tenants of this instance.'
        : `You manage the ${count === 1 ? 'tenant' : `${count} tenants`} of this instance.`;
    }
    return 'Signed in to this instance.';
  });

  protected readonly quickActions = computed(() =>
    QUICK_ACTIONS.filter((action) => !action.roles.length || this.hasRole(...action.roles)).slice(
      0,
      4
    )
  );

  protected readonly authMode = computed(() => {
    const mode = this.config.data()?.authMode;
    return mode ? (AUTH_MODES[mode] ?? mode) : undefined;
  });

  protected readonly importMode = computed(() => {
    const mode = this.config.data()?.configImportMode;
    return mode ? (IMPORT_MODES[mode] ?? mode) : undefined;
  });

  protected readonly clientCount = computed(() => {
    const tenants = this.tenants.data();
    if (!tenants?.some((tenant) => tenant.clients)) return undefined;
    return tenants.reduce((sum, tenant) => sum + (tenant.clients?.length ?? 0), 0);
  });

  protected readonly activeTenants = computed(
    () => this.tenants.data()?.filter((tenant) => tenant.status === 'active').length ?? 0
  );

  protected readonly versionLabel = computed(() => versionLabel(this.version.data()?.version));

  /** A tenant's avatar, in one of the brand gradients picked from its ID. */
  protected avatar(id: string): string {
    return `grid size-10 shrink-0 place-items-center rounded-xl text-xs font-bold text-white ${monogramGradient(id)}`;
  }

  protected actionTile(action: QuickAction): string {
    return `grid size-11 shrink-0 place-items-center rounded-2xl text-white ${ACTION_TILES[action.tone]}`;
  }

  /** How the sessions of one type split up by outcome. */
  protected sessionParts(stats: SessionTypeStatsDto | undefined): StatPart[] {
    if (!stats) return [];
    const by = stats.byStatus;
    return [
      { label: 'completed', value: by.completed, tone: 'success' },
      { label: 'failed', value: by.failed, tone: 'danger' },
      { label: 'open', value: by.active + by.fetched, tone: 'progress' },
      { label: 'ended', value: by.expired + by.cancelled, tone: 'muted' },
    ];
  }

  protected isPresentation(session: Session): boolean {
    return !!session.requestId;
  }

  /** What the session was about: its reference, the configuration it used, or its ID. */
  protected sessionTitle(session: Session): string {
    return (
      session.reference ||
      session.requestId ||
      session.credentialConfigurationIds?.join(', ') ||
      `Session ${session.id.slice(0, 8)}`
    );
  }

  protected status(session: Session) {
    return SESSION_STATUS[session.status];
  }

  protected ago(iso: string): string {
    return relativeTime(iso);
  }

  protected initials(name: string): string {
    return initialsOf(name);
  }

  private hasRole(...wanted: Role[]): boolean {
    const roles = this.roles();
    return wanted.some((role) => roles.includes(role));
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
