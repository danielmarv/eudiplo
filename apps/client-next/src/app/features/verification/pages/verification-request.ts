import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import type { OfferResponse, PresentationConfig, PresentationRequest } from '@eudiplo/sdk-core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideCircleAlert,
  lucideIdCard,
  lucidePlus,
  lucideQrCode,
  lucideScanLine,
  lucideSearch,
  lucideSmartphone,
  lucideTriangleAlert,
} from '@ng-icons/lucide';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import { HlmInputGroupImports } from '@spartan-ng/helm/input-group';
import { HlmNativeSelectImports } from '@spartan-ng/helm/native-select';
import { HlmSkeletonImports } from '@spartan-ng/helm/skeleton';
import { HlmSpinnerImports } from '@spartan-ng/helm/spinner';
import { HlmSwitchImports } from '@spartan-ng/helm/switch';
import { HlmTextareaImports } from '@spartan-ng/helm/textarea';
import { HlmTooltipImports } from '@spartan-ng/helm/tooltip';
import { injectMutation, injectQuery } from '@tanstack/angular-query-experimental';
import { CallerService } from '../../../core/auth/caller.service';
import { SessionService } from '../../../core/auth/session.service';
import { getApiErrorMessage } from '../../../core/errors/error-message';
import { NotifyService } from '../../../core/notify/notify.service';
import { VerificationResult } from '../components/verification-result';
import {
  accessReadiness,
  CLIENT_ID_SCHEMES,
  type ClientIdScheme,
  originProblem,
  parseTransactionData,
  requestedCredentials,
} from '../data/verification-request';
import {
  createPresentationRequestMutation,
  defaultAccessKeyChainQuery,
  keyChainsQuery,
} from '../data/verification-queries';
import { presentationConfigsQuery } from '../../presentation-configs/data/presentation-config-queries';
import { PageHeader } from '../../../shared/pages/page-header';

/** Roles that may read key chains, so the page can check the access certificate first. */
const KEY_READERS = ['issuance:manage', 'presentation:manage', 'keys:manage'];

/**
 * Asks a wallet to present credentials: choose a presentation configuration, how the wallet gets
 * the request (QR code or link, or the Digital Credentials API on this device), how it identifies
 * the verifier, and optionally other transaction data. Before it creates the request, the page
 * says why the access certificate or the allowed origins would stop it. The request then shows
 * here, with its state until the wallet is done and what it shared.
 */
@Component({
  selector: 'app-verification-request',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    NgIcon,
    HlmButtonImports,
    HlmInputGroupImports,
    HlmNativeSelectImports,
    HlmSkeletonImports,
    HlmSpinnerImports,
    HlmSwitchImports,
    HlmTextareaImports,
    HlmTooltipImports,
    PageHeader,
    VerificationResult,
  ],
  providers: [
    provideIcons({
      lucideCircleAlert,
      lucideIdCard,
      lucidePlus,
      lucideQrCode,
      lucideScanLine,
      lucideSearch,
      lucideSmartphone,
      lucideTriangleAlert,
    }),
  ],
  templateUrl: './verification-request.html',
})
export class VerificationRequest {
  /** A configuration to request at once, from `/offer/presentation/<id>`. */
  readonly id = input<string>();

  private readonly instance = inject(SessionService).getBaseUrl();
  private readonly caller = inject(CallerService).loadedCaller;
  private readonly tenant = computed(() => this.caller()?.tenantId);
  private readonly notify = inject(NotifyService);

  /** The origin the browser sends with the request, which the DC API call uses too. */
  protected readonly origin = location.origin;

  protected readonly configs = injectQuery(() =>
    presentationConfigsQuery(this.instance, this.tenant())
  );
  /** Without a role that reads key chains, the backend checks the certificate on creation. */
  private readonly readsKeys = computed(() =>
    KEY_READERS.some((role) => this.caller()?.roles.includes(role))
  );
  protected readonly managesConfigs = computed(
    () => !!this.caller()?.roles.includes('presentation:manage')
  );
  private readonly keyChains = injectQuery(() =>
    keyChainsQuery(this.instance, this.tenant(), this.readsKeys())
  );
  private readonly defaultAccess = injectQuery(() =>
    defaultAccessKeyChainQuery(this.instance, this.tenant(), this.readsKeys())
  );
  private readonly creation = injectMutation(() => createPresentationRequestMutation());
  protected readonly creating = this.creation.isPending;

  protected readonly selectedId = signal('');
  protected readonly dcApi = signal(false);
  protected readonly clientIdScheme = signal<ClientIdScheme>('x509_hash');
  protected readonly overrideTransactionData = signal(false);
  protected readonly transactionData = signal('');
  protected readonly transactionDataError = signal('');
  protected readonly search = signal('');

  protected readonly created = signal<{ offer: OfferResponse; dcApi: boolean } | null>(null);

  protected readonly clientIdSchemes = CLIENT_ID_SCHEMES;
  protected readonly requestedCredentials = requestedCredentials;

  protected readonly selected = computed(() =>
    this.configs.data()?.find((config) => config.id === this.selectedId())
  );
  protected readonly visible = computed(() => {
    const all = this.configs.data() ?? [];
    const term = this.search().trim().toLowerCase();
    if (!term) return all;
    return all.filter((config: PresentationConfig) =>
      [config.id, config.description].some((field) => field?.toLowerCase().includes(term))
    );
  });
  protected readonly schemeHint = computed(
    () => CLIENT_ID_SCHEMES.find((scheme) => scheme.value === this.clientIdScheme())?.hint ?? ''
  );

  /** Why the selected configuration's request would be refused for its origin. */
  protected readonly originProblem = computed(() =>
    originProblem(this.selected(), this.dcApi(), this.origin)
  );

  /** Whether the access certificate is there; undefined while it is checked or cannot be. */
  protected readonly readiness = computed(() => {
    const config = this.selected();
    if (!config || !this.readsKeys()) return { ready: true } as const;
    if (this.keyChains.isError()) return { ready: true } as const;
    const chains = this.keyChains.data();
    if (!chains || this.defaultAccess.isPending()) return undefined;
    return accessReadiness(config, chains, this.defaultAccess.data());
  });

  /** Why the request cannot be created now, or nothing when it can. */
  protected readonly blocked = computed(() => {
    if (this.creating()) return 'Creating the request…';
    if (!this.selected()) return 'Choose a presentation configuration first.';
    if (this.originProblem()) return this.originProblem();
    const readiness = this.readiness();
    if (!readiness) return 'Checking the access certificate…';
    return readiness.ready ? '' : readiness.reason;
  });

  /** A configuration the route names, requested at once; `done` once it was. */
  private readonly requestOnLoad = signal('');

  constructor() {
    const again = (history.state as { presentationRequest?: { requestId?: string } } | null)
      ?.presentationRequest?.requestId;
    if (again) this.selectedId.set(again);

    effect(() => {
      const configs = this.configs.data();
      if (!configs) return;
      untracked(() => {
        const id = this.id();
        if (id && !this.requestOnLoad() && configs.some((config) => config.id === id)) {
          this.selectedId.set(id);
          this.requestOnLoad.set(id);
        } else if (!this.selectedId() && configs.length === 1) {
          this.selectedId.set(configs[0].id);
        }
      });
    });

    // Request the configuration the route names once nothing stands in the way.
    effect(() => {
      const id = this.requestOnLoad();
      if (!id || id === 'done' || this.blocked() === 'Checking the access certificate…') return;
      untracked(() => {
        this.requestOnLoad.set('done');
        this.create();
      });
    });
  }

  protected choose(id: string): void {
    this.selectedId.set(id);
  }

  protected setOverride(on: boolean): void {
    this.overrideTransactionData.set(on);
    this.transactionDataError.set('');
    if (on && !this.transactionData().trim()) {
      const current = this.selected()?.transaction_data;
      this.transactionData.set(current?.length ? JSON.stringify(current, null, 2) : '');
    }
  }

  protected create(): void {
    const blocked = this.blocked();
    if (blocked) {
      if (!this.creating()) this.notify.error(blocked);
      return;
    }
    let transactionData: PresentationRequest['transaction_data'];
    if (this.overrideTransactionData()) {
      try {
        transactionData = parseTransactionData(this.transactionData());
      } catch (error) {
        this.transactionDataError.set((error as Error).message);
        this.notify.error('Check the transaction data.');
        return;
      }
    }
    const dcApi = this.dcApi();
    const body: PresentationRequest = {
      requestId: this.selectedId(),
      response_type: dcApi ? 'dc-api' : 'uri',
      // The wallet is called from this page, so the request is bound to its origin.
      ...(dcApi ? { expected_origin: this.origin } : {}),
      ...(this.clientIdScheme() !== 'x509_hash' ? { clientIdScheme: this.clientIdScheme() } : {}),
      ...(transactionData ? { transaction_data: transactionData } : {}),
    };
    this.creation.mutate(body, {
      onSuccess: (offer) => {
        this.created.set({ offer, dcApi });
        this.notify.success('Presentation request created.');
      },
      // The backend names a missing access certificate here.
      onError: (error) =>
        this.notify.error(getApiErrorMessage(error, 'Failed to create the presentation request')),
    });
  }

  protected reset(): void {
    this.created.set(null);
  }

  protected onSearch(event: Event): void {
    this.search.set((event.target as HTMLInputElement).value);
  }

  protected loadError(): string {
    return getApiErrorMessage(
      this.configs.error(),
      'Failed to load the presentation configurations'
    );
  }
}
