import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  type ElementRef,
  effect,
  inject,
  Injector,
  input,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { isDcApiAvailable, type Session } from '@eudiplo/sdk-core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideActivity,
  lucideArrowLeft,
  lucideBadgeCheck,
  lucideCircleCheck,
  lucideCircleSlash,
  lucideCircleX,
  lucideCopy,
  lucideFileText,
  lucideHourglass,
  lucideRefreshCw,
  lucideRotateCcw,
  lucideShieldAlert,
  lucideSmartphone,
  lucideTriangleAlert,
} from '@ng-icons/lucide';
import { HlmAlertDialogImports } from '@spartan-ng/helm/alert-dialog';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import { HlmInputImports } from '@spartan-ng/helm/input';
import { HlmSkeletonImports } from '@spartan-ng/helm/skeleton';
import { HlmSpinnerImports } from '@spartan-ng/helm/spinner';
import { HlmTabsImports } from '@spartan-ng/helm/tabs';
import { HlmTooltipImports } from '@spartan-ng/helm/tooltip';
import { injectMutation, injectQuery } from '@tanstack/angular-query-experimental';
import { CallerService } from '../../../core/auth/caller.service';
import { SessionService } from '../../../core/auth/session.service';
import { frontendConfigQuery } from '../../../core/config/frontend-config';
import { getApiErrorMessage, hasHttpStatus } from '../../../core/errors/error-message';
import { NotifyService } from '../../../core/notify/notify.service';
import { copyText } from '../../../shared/clipboard/copy-text';
import { dateTime } from '../../../shared/format/date-time';
import { decodeJwtPart } from '../../../shared/format/jwt';
import { PageHeader } from '../../../shared/pages/page-header';
import { sessionLogsUrl, sessionTracesUrl, traceUrl } from '../../../shared/sessions/grafana-links';
import { presentedCredentials } from '../../../shared/sessions/presented-claims';
import {
  CREDENTIAL_STATUS_CHANGER_ROLES,
  CREDENTIAL_STATUS_READER_ROLES,
  isCancelConflict,
  isCancellable,
  isPresentationSession,
  maySessionChange,
  type SessionResult,
  sessionOfferRole,
  sessionResult,
  sessionStatusLabel,
} from '../../../shared/sessions/session-outcome';
import { sessionQuery } from '../../issuance/data/issuance-queries';
import { presentWithDcApi } from '../../verification/data/dc-api';
import { CredentialStatusCard } from '../components/credential-status-card';
import { cancelSessionMutation, sessionLogsQuery } from '../data/session-queries';

/** Pretty JSON of a value the page shows as technical data. */
function json(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

/**
 * One session (`/session-management/:id`): how it ended or what the wallet still needs (its QR
 * code, link or Digital Credentials API button), what a wallet presented, the status of the
 * credentials it issued, its details, and its raw data and log. It updates until the session
 * ends. A pending one can be cancelled with a reason; any one can be recreated as a new offer
 * or request.
 */
@Component({
  selector: 'app-session-detail',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    NgTemplateOutlet,
    ReactiveFormsModule,
    RouterLink,
    NgIcon,
    HlmAlertDialogImports,
    HlmButtonImports,
    HlmInputImports,
    HlmSkeletonImports,
    HlmSpinnerImports,
    HlmTabsImports,
    HlmTooltipImports,
    CredentialStatusCard,
    PageHeader,
  ],
  providers: [
    provideIcons({
      lucideActivity,
      lucideArrowLeft,
      lucideBadgeCheck,
      lucideCircleCheck,
      lucideCircleSlash,
      lucideCircleX,
      lucideCopy,
      lucideFileText,
      lucideHourglass,
      lucideRefreshCw,
      lucideRotateCcw,
      lucideShieldAlert,
      lucideSmartphone,
      lucideTriangleAlert,
    }),
  ],
  templateUrl: './session-detail.html',
})
export class SessionDetail {
  /** The session's ID, from the route. */
  readonly id = input.required<string>();

  private readonly instance = inject(SessionService).getBaseUrl();
  private readonly caller = inject(CallerService).loadedCaller;
  private readonly tenant = computed(() => this.caller()?.tenantId);
  private readonly roles = computed(() => this.caller()?.roles ?? []);
  private readonly router = inject(Router);
  private readonly notify = inject(NotifyService);
  private readonly injector = inject(Injector);
  private readonly heading = viewChild<ElementRef<HTMLElement>>('heading');

  protected readonly session = injectQuery(() =>
    sessionQuery(this.instance, this.tenant(), this.id())
  );
  protected readonly logs = injectQuery(() =>
    sessionLogsQuery(this.instance, this.tenant(), this.id())
  );
  private readonly frontendConfig = injectQuery(() => frontendConfigQuery(this.instance));
  private readonly cancel = injectMutation(() => cancelSessionMutation());

  protected readonly current = computed(() => this.session.data());
  protected readonly presentation = computed(() => isPresentationSession(this.current()));
  protected readonly result = computed<SessionResult | null>(() => {
    const session = this.current();
    return session ? sessionResult(session) : null;
  });
  /** Whether it still changes; the page then updates every few seconds. */
  protected readonly live = computed(() => {
    const session = this.current();
    return !!session && !this.result();
  });

  /** The backend returns the offer or request only to callers that may change the session. */
  protected readonly canSeeOffer = computed(() => {
    const session = this.current();
    return !!session && maySessionChange(this.roles(), session);
  });
  protected readonly canCancel = computed(() => {
    const session = this.current();
    return !!session && isCancellable(session) && this.canSeeOffer();
  });
  protected readonly canRecreate = computed(() => {
    const session = this.current();
    if (!session || !this.roles().includes(sessionOfferRole(session))) return false;
    return this.presentation() ? !!session.requestId : !!session.credentialPayload;
  });
  protected readonly canReadStatus = computed(
    () =>
      !this.presentation() &&
      CREDENTIAL_STATUS_READER_ROLES.some((role) => this.roles().includes(role))
  );
  protected readonly canChangeStatus = computed(() =>
    CREDENTIAL_STATUS_CHANGER_ROLES.some((role) => this.roles().includes(role))
  );

  /** The presentation or credential configurations the session was created for. */
  protected readonly configurationIds = computed(() => {
    const session = this.current();
    if (!session) return [];
    if (session.requestId) return [session.requestId];
    return (
      session.credentialConfigurationIds ??
      session.credentialPayload?.credentialConfigurationIds ??
      []
    );
  });
  /** The offer or request link a wallet opens, while it is still usable. */
  protected readonly link = computed(() => {
    const session = this.current();
    if (!session || session.status !== 'active') return null;
    return session.offerUrl || session.requestUrl || null;
  });
  protected readonly qr = signal<string | null>(null);
  protected readonly presented = computed(() => {
    const session = this.current();
    return session?.status === 'completed' ? presentedCredentials(session.credentials) : [];
  });
  protected readonly dcApiAvailable = isDcApiAvailable();
  protected readonly presenting = signal(false);

  private readonly grafana = computed(() => this.frontendConfig.data()?.grafana);
  protected readonly logsUrl = computed(() => {
    const session = this.current();
    return session ? sessionLogsUrl(this.grafana(), session.id, session.createdAt) : null;
  });
  protected readonly tracesUrl = computed(() => {
    const session = this.current();
    return session ? sessionTracesUrl(this.grafana(), session.id) : null;
  });

  // ---- Cancel ----

  protected readonly confirmingCancel = signal(false);
  protected readonly reason = new FormControl('', {
    nonNullable: true,
    validators: [Validators.maxLength(500)],
  });

  protected readonly statusLabel = sessionStatusLabel;
  protected readonly dateTime = dateTime;
  protected readonly json = json;

  constructor() {
    // The QR code of the link a wallet still can open.
    let drawn = '';
    effect(() => {
      const link = this.link();
      if (!link || link === drawn) return;
      drawn = link;
      void import('qrcode')
        .then(({ toDataURL }) => toDataURL(link, { margin: 1, width: 480 }))
        .then((url) => this.qr.set(url))
        .catch(() => this.qr.set(null));
    });
    // A change of the session adds to its log.
    effect(() => {
      this.session.dataUpdatedAt();
      untracked(() => void this.logs.refetch());
    });
  }

  protected copy(text: string, what: string): void {
    void copyText(this.notify, text, what);
  }

  /** The decoded presentation request, or why it cannot be decoded. */
  protected requestPayload(requestObject: string): string {
    try {
      return json(decodeJwtPart(requestObject, 'payload'));
    } catch (error) {
      return `The request could not be decoded: ${error instanceof Error ? error.message : 'unknown error'}`;
    }
  }

  protected traceOf(detail: Record<string, unknown> | undefined): string | null {
    const id = detail?.['traceId'] ?? detail?.['trace_id'];
    return typeof id === 'string' ? traceUrl(this.grafana(), id) : null;
  }

  /** Per-credential results explain a failure; on success only their warnings matter. */
  protected showCredentialResults(result: SessionResult): boolean {
    return result.tone === 'success'
      ? result.credentials.some((credential) => (credential.warnings?.length ?? 0) > 0)
      : result.credentials.length > 0;
  }

  /** The trusted entity that matched the credential of a query, when verification recorded it. */
  protected trustedIssuer(session: Session, queryId: string): string | null {
    return (
      session.outcome?.credentials?.find((item) => item.id === queryId)?.trust?.matchedIssuer ??
      null
    );
  }

  protected docTypeOf(session: Session, queryId: string): string | null {
    return session.outcome?.credentials?.find((item) => item.id === queryId)?.docType ?? null;
  }

  protected recreate(session: Session): void {
    if (session.requestId) {
      void this.router.navigate(['/offer/presentation'], {
        state: { presentationRequest: { requestId: session.requestId } },
      });
    } else if (session.credentialPayload) {
      void this.router.navigate(['/offer/issuance'], {
        state: { offerRequest: session.credentialPayload },
      });
    }
  }

  protected async presentHere(session: Session): Promise<void> {
    if (!session.requestObject || this.presenting()) return;
    this.presenting.set(true);
    try {
      await presentWithDcApi(session.requestObject);
      this.notify.success('Presentation sent.');
    } catch (error) {
      this.notify.error(error instanceof Error ? error.message : 'The presentation failed.');
    } finally {
      this.presenting.set(false);
      void this.session.refetch();
    }
  }

  protected askCancel(): void {
    if (!this.canCancel() || this.cancel.isPending()) return;
    this.reason.reset('');
    this.confirmingCancel.set(true);
  }

  protected onCancelDialog(state: string): void {
    if (state === 'closed' && !this.cancel.isPending()) this.confirmingCancel.set(false);
  }

  protected confirmCancel(session: Session): void {
    if (this.reason.invalid || this.cancel.isPending()) return;
    const reason = this.reason.value.trim();
    const presentation = isPresentationSession(session);
    this.cancel.mutate(
      { id: session.id, ...(reason ? { reason } : {}) },
      {
        onSuccess: () =>
          this.notify.success(presentation ? 'Request cancelled.' : 'Offer cancelled.'),
        onError: (error) =>
          this.notify.error(
            isCancelConflict(error)
              ? 'The session could not be cancelled: it is no longer pending.'
              : getApiErrorMessage(error, 'The session could not be cancelled')
          ),
        onSettled: () => {
          this.confirmingCancel.set(false);
          void this.session.refetch();
          // Cancel goes away with the pending session, so its focus would fall to the page.
          afterNextRender(() => this.heading()?.nativeElement.focus(), {
            injector: this.injector,
          });
        },
      }
    );
  }

  protected notFound(error: unknown): boolean {
    return hasHttpStatus(error, 404);
  }

  protected errorMessage(error: unknown): string {
    return getApiErrorMessage(error, 'Failed to load the session');
  }
}
