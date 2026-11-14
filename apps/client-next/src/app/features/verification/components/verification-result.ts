import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { isDcApiAvailable, type OfferResponse } from '@eudiplo/sdk-core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideBadgeCheck,
  lucideCircleCheck,
  lucideCircleX,
  lucideCopy,
  lucideExternalLink,
  lucideRotateCcw,
  lucideShieldAlert,
  lucideSmartphone,
  lucideTriangleAlert,
} from '@ng-icons/lucide';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import { HlmSkeletonImports } from '@spartan-ng/helm/skeleton';
import { HlmSpinnerImports } from '@spartan-ng/helm/spinner';
import { HlmTooltipImports } from '@spartan-ng/helm/tooltip';
import { injectQuery, QueryClient } from '@tanstack/angular-query-experimental';
import { CallerService } from '../../../core/auth/caller.service';
import { SessionService } from '../../../core/auth/session.service';
import { NotifyService } from '../../../core/notify/notify.service';
import { copyText } from '../../../shared/clipboard/copy-text';
import { presentedCredentials } from '../../../shared/sessions/presented-claims';
import { sessionQuery } from '../../issuance/data/issuance-queries';
import { presentWithDcApi } from '../data/dc-api';

type Tone = 'wait' | 'good' | 'bad';

/**
 * A presentation request that was just created: its QR code and link for a wallet, or, with the
 * Digital Credentials API, the button that asks a wallet on this device. The state of its session
 * updates until the wallet is done; then it shows whether each credential was verified and the
 * claims the wallet disclosed.
 */
@Component({
  selector: 'app-verification-result',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgIcon, HlmButtonImports, HlmSkeletonImports, HlmSpinnerImports, HlmTooltipImports],
  providers: [
    provideIcons({
      lucideBadgeCheck,
      lucideCircleCheck,
      lucideCircleX,
      lucideCopy,
      lucideExternalLink,
      lucideRotateCcw,
      lucideShieldAlert,
      lucideSmartphone,
      lucideTriangleAlert,
    }),
  ],
  host: { class: 'grid gap-6' },
  templateUrl: './verification-result.html',
})
export class VerificationResult {
  private readonly notify = inject(NotifyService);
  private readonly queryClient = inject(QueryClient);
  private readonly instance = inject(SessionService).getBaseUrl();
  private readonly caller = inject(CallerService).loadedCaller;
  private readonly tenant = computed(() => this.caller()?.tenantId);

  readonly offer = input.required<OfferResponse>();
  /** Whether the request goes through the Digital Credentials API instead of a QR code. */
  readonly dcApi = input(false);
  readonly another = output<void>();

  protected readonly session = injectQuery(() =>
    sessionQuery(this.instance, this.tenant(), this.offer().session)
  );

  protected readonly state = computed((): { title: string; detail: string; tone: Tone } => {
    const session = this.session.data();
    const failure = session?.outcome?.message || session?.errorReason || session?.failureCode;
    switch (session?.status ?? 'active') {
      case 'active':
        return this.dcApi()
          ? {
              title: 'Ready for the wallet',
              detail: 'Ask a wallet on this device with the button below.',
              tone: 'wait',
            }
          : {
              title: 'Waiting for the wallet',
              detail:
                'Scan the code with a wallet, or open the request in a wallet on this device.',
              tone: 'wait',
            };
      case 'fetched':
        return {
          title: 'The wallet has the request',
          detail: 'Waiting for the holder to agree to share.',
          tone: 'wait',
        };
      case 'completed':
        return session?.outcome?.result === 'failed'
          ? { title: 'Presentation not verified', detail: failure ?? '', tone: 'bad' }
          : {
              title: 'Presentation verified',
              detail: 'The wallet shared the credentials, and they were verified.',
              tone: 'good',
            };
      case 'expired':
        return {
          title: 'Request expired',
          detail: 'No wallet answered in time. Create a new request.',
          tone: 'bad',
        };
      case 'cancelled':
        return { title: 'Request cancelled', detail: 'The request was cancelled.', tone: 'bad' };
      default:
        return {
          title: 'Presentation failed',
          detail: failure
            ? `The wallet or verifier reported: ${failure}`
            : 'The wallet reported a failure.',
          tone: 'bad',
        };
    }
  });

  /** The verification result of each requested credential, once the wallet answered. */
  protected readonly results = computed(() => this.session.data()?.outcome?.credentials ?? []);
  /** The claims the wallet disclosed, once the presentation is complete. */
  protected readonly presented = computed(() => {
    const session = this.session.data();
    return session?.status === 'completed' ? presentedCredentials(session.credentials) : [];
  });

  protected readonly tone = {
    good: 'bg-success/12 text-success',
    bad: 'bg-destructive/10 text-destructive',
    wait: 'bg-primary/10 text-primary',
  } as const;

  protected readonly qrCode = signal<string | undefined>(undefined);
  protected readonly dcApiAvailable = isDcApiAvailable();
  protected readonly presenting = signal(false);

  /** Why the wallet on this device cannot be asked now, or nothing when it can. */
  protected readonly dcApiBlocked = computed(() => {
    if (!this.dcApiAvailable) {
      return 'This browser does not support the Digital Credentials API. Try a current Chrome or Safari.';
    }
    const session = this.session.data();
    if (!session) return 'Loading the request…';
    if (session.status !== 'active' && session.status !== 'fetched') return this.state().title;
    if (!session.requestObject) return 'The signed request is not ready yet.';
    return '';
  });

  constructor() {
    effect(() => {
      if (this.dcApi()) return;
      const uri = this.offer().uri;
      this.qrCode.set(undefined);
      // Loaded with the result only: the code is drawn once per request.
      void import('qrcode')
        .then(({ toDataURL }) => toDataURL(uri, { margin: 1, width: 480 }))
        .then((image) => {
          if (this.offer().uri === uri) this.qrCode.set(image);
        })
        .catch((error: unknown) => console.error('Drawing the QR code failed:', error));
    });
  }

  protected async present(): Promise<void> {
    const requestObject = this.session.data()?.requestObject;
    if (this.presenting() || this.dcApiBlocked() || !requestObject) return;
    this.presenting.set(true);
    try {
      await presentWithDcApi(requestObject);
      this.notify.success('The wallet shared the presentation.');
    } catch (error) {
      this.notify.error(error instanceof Error ? error.message : String(error));
    } finally {
      this.presenting.set(false);
      // A rejected response ends the session too; its status says why.
      void this.queryClient.invalidateQueries({
        queryKey: sessionQuery(this.instance, this.tenant(), this.offer().session).queryKey,
      });
    }
  }

  protected copy(): void {
    void copyText(this.notify, this.offer().uri, 'Request link');
  }
}
