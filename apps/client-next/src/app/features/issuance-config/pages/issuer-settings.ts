import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import type { IssuanceConfig } from '@eudiplo/sdk-core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideBan,
  lucideBell,
  lucideBellOff,
  lucideCalendarClock,
  lucideCircleAlert,
  lucideCircleCheck,
  lucideCircleDashed,
  lucideCircleX,
  lucideClock,
  lucideCopy,
  lucideDownload,
  lucideFileBadge,
  lucideHash,
  lucideIdCard,
  lucideLanguages,
  lucideLayers,
  lucideListChecks,
  lucideLock,
  lucidePencil,
  lucideRefreshCw,
  lucideServer,
  lucideShieldCheck,
  lucideShieldOff,
  lucideTriangleAlert,
  lucideUserCheck,
  lucideWandSparkles,
} from '@ng-icons/lucide';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import { HlmSkeletonImports } from '@spartan-ng/helm/skeleton';
import { HlmSpinnerImports } from '@spartan-ng/helm/spinner';
import { HlmTabsImports } from '@spartan-ng/helm/tabs';
import { HlmTooltipImports } from '@spartan-ng/helm/tooltip';
import { injectMutation, injectQuery, QueryClient } from '@tanstack/angular-query-experimental';
import { CallerService } from '../../../core/auth/caller.service';
import { SessionService } from '../../../core/auth/session.service';
import { getApiErrorMessage } from '../../../core/errors/error-message';
import { NotifyService } from '../../../core/notify/notify.service';
import { initialsOf } from '../../../shared/brand/monogram';
import { copyText } from '../../../shared/clipboard/copy-text';
import { ConfigDocumentService } from '../../../shared/config-ownership/config-document.service';
import {
  configOwnershipQuery,
  fileManaged,
  lockReason,
} from '../../../shared/config-ownership/config-ownership';
import { OwnershipNotice } from '../../../shared/config-ownership/ownership-notice';
import { dateTime } from '../../../shared/format/date-time';
import { decodeJwtPart, type JwtPart } from '../../../shared/format/jwt';
import { relativeTime } from '../../../shared/format/relative-time';
import { PageHeader } from '../../../shared/pages/page-header';
import {
  issuanceConfigQuery,
  reissueRegistrationCertificateMutation,
} from '../../issuance/data/issuance-queries';
import {
  authorizationServers,
  DEFAULT_TX_CODE_MAX_ATTEMPTS,
  generatesCertificate,
  registrationJwt,
  registrationStatus,
  type RegistrationStatus,
  renewalLabel,
  statusCheckModeLabel,
} from '../data/issuer-settings';

/** The tabs of the page, by the `tab` query parameter that keeps the open one. */
const TABS = ['metadata', 'authorization', 'security', 'certificate'] as const;
type Tab = (typeof TABS)[number];

/** The issuer settings are one resource per tenant, with this ID in configuration files. */
const RESOURCE_ID = 'issuance';

const STATUS: Record<RegistrationStatus, { label: string; icon: string; tone: string }> = {
  off: { label: 'Not used', icon: 'lucideBan', tone: 'bg-muted text-muted-foreground' },
  pending: {
    label: 'Not issued yet',
    icon: 'lucideCircleDashed',
    tone: 'bg-muted text-foreground',
  },
  active: { label: 'Active', icon: 'lucideCircleCheck', tone: 'bg-success/12 text-success' },
  expiring: {
    label: 'Expires within a week',
    icon: 'lucideCircleAlert',
    tone: 'bg-warning/12 text-warning',
  },
  expired: { label: 'Expired', icon: 'lucideCircleX', tone: 'bg-destructive/10 text-destructive' },
};

/**
 * The issuer's settings: how wallets show the issuer, the authorization servers they are sent to,
 * what the issuer asks of wallets, and its registration certificate, which can be regenerated
 * here. The settings can be edited, set up step by step and downloaded as a configuration file;
 * settings that a file provisioned are read-only here, and the page says so.
 */
@Component({
  selector: 'app-issuer-settings',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    NgIcon,
    HlmButtonImports,
    HlmSkeletonImports,
    HlmSpinnerImports,
    HlmTabsImports,
    HlmTooltipImports,
    OwnershipNotice,
    PageHeader,
  ],
  providers: [
    provideIcons({
      lucideBan,
      lucideBell,
      lucideBellOff,
      lucideCalendarClock,
      lucideCircleAlert,
      lucideCircleCheck,
      lucideCircleDashed,
      lucideCircleX,
      lucideClock,
      lucideCopy,
      lucideDownload,
      lucideFileBadge,
      lucideHash,
      lucideIdCard,
      lucideLanguages,
      lucideLayers,
      lucideListChecks,
      lucideLock,
      lucidePencil,
      lucideRefreshCw,
      lucideServer,
      lucideShieldCheck,
      lucideShieldOff,
      lucideTriangleAlert,
      lucideUserCheck,
      lucideWandSparkles,
    }),
  ],
  templateUrl: './issuer-settings.html',
})
export class IssuerSettings {
  private readonly instance = inject(SessionService).getBaseUrl();
  private readonly caller = inject(CallerService).loadedCaller;
  private readonly tenant = computed(() => this.caller()?.tenantId);
  private readonly router = inject(Router);
  private readonly queryClient = inject(QueryClient);
  private readonly notify = inject(NotifyService);
  protected readonly documents = inject(ConfigDocumentService);

  /** The open tab, from the `tab` query parameter. */
  readonly tab = input<string>();
  protected readonly openTab = computed<Tab>(() =>
    TABS.includes(this.tab() as Tab) ? (this.tab() as Tab) : 'metadata'
  );

  protected readonly settings = injectQuery(() =>
    issuanceConfigQuery(this.instance, this.tenant())
  );
  private readonly ownership = injectQuery(() =>
    configOwnershipQuery(this.instance, this.tenant(), 'IssuanceConfig')
  );
  protected readonly owner = computed(() =>
    this.ownership.data()?.find((resource) => resource.resourceId === RESOURCE_ID)
  );
  /** Why the settings cannot be changed here, or nothing when they can. */
  protected readonly locked = computed(() => {
    const managed = fileManaged(this.ownership.data()).get(RESOURCE_ID);
    return managed ? lockReason(managed) : '';
  });

  protected readonly reissue = injectMutation(() => ({
    ...reissueRegistrationCertificateMutation(),
    onSuccess: (updated: IssuanceConfig) => {
      this.queryClient.setQueryData(
        issuanceConfigQuery(this.instance, this.tenant()).queryKey,
        updated
      );
      this.notify.success('Registration certificate regenerated.', {
        description: 'The certificate it replaced, if any, was revoked.',
      });
    },
    onError: (error: Error) =>
      this.notify.error(
        getApiErrorMessage(error, 'Failed to regenerate the registration certificate')
      ),
  }));

  protected readonly display = computed(() => this.settings.data()?.display?.[0]);
  /** A logo that did not load: wallets would show none either, so the initials stand in. */
  protected readonly failedLogo = signal<string | undefined>(undefined);
  protected readonly servers = computed(() => {
    const settings = this.settings.data();
    return settings ? authorizationServers(settings) : [];
  });
  protected readonly certificate = computed(() => {
    const settings = this.settings.data();
    if (!settings) return undefined;
    const jwt = registrationJwt(settings);
    return {
      config: settings.registrationCertificate,
      cache: settings.registrationCertificateCache,
      status: STATUS[registrationStatus(settings)],
      generated: generatesCertificate(settings),
      renewal: renewalLabel(settings.registrationCertificate?.renewal),
      jwt,
      decoded: jwt ? [decoded(jwt, 'header'), decoded(jwt, 'payload')] : [],
    };
  });

  protected readonly defaultTxCodeAttempts = DEFAULT_TX_CODE_MAX_ATTEMPTS;
  protected readonly initialsOf = initialsOf;
  protected readonly dateTime = dateTime;
  protected readonly relativeTime = relativeTime;
  protected readonly statusCheckModeLabel = statusCheckModeLabel;

  protected selectTab(tab: string): void {
    void this.router.navigate([], {
      queryParams: { tab: tab === 'metadata' ? null : tab },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  protected download(): void {
    void this.documents.download('IssuanceConfig', RESOURCE_ID);
  }

  protected downloading(): boolean {
    return this.documents.isDownloading('IssuanceConfig', RESOURCE_ID);
  }

  protected regenerate(): void {
    // The button stays focusable while it runs, so a second click lands here.
    if (!this.reissue.isPending()) this.reissue.mutate();
  }

  protected copyJwt(jwt: string): void {
    void copyText(this.notify, jwt, 'Registration certificate');
  }

  protected errorMessage(error: unknown): string {
    return getApiErrorMessage(error, 'Failed to load the issuer settings');
  }

  /** A time in seconds since 1970 relative to now, such as "in 3 months". */
  protected fromNow(seconds: number): string {
    return relativeTime(new Date(seconds * 1000).toISOString());
  }
}

/** A part of the certificate as indented JSON, or why it cannot be read. */
function decoded(jwt: string, part: JwtPart): { name: string; json?: string; error?: string } {
  const name = part === 'header' ? 'Header' : 'Payload';
  try {
    return { name, json: JSON.stringify(decodeJwtPart(jwt, part), null, 2) };
  } catch (error) {
    return { name, error: error instanceof Error ? error.message : String(error) };
  }
}
