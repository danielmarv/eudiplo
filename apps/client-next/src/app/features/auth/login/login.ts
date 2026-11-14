import { NgTemplateOutlet } from '@angular/common';
import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  type ElementRef,
  inject,
  Injector,
  type OnDestroy,
  type OnInit,
  signal,
  viewChild,
} from '@angular/core';
import {
  type AbstractControl,
  FormBuilder,
  type FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { OAuth2HttpError } from '@badgateway/oauth2-client';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideBookOpen,
  lucideBuilding2,
  lucideCircleHelp,
  lucideCodeXml,
  lucideEye,
  lucideEyeOff,
  lucideGlobe,
  lucideKeyRound,
  lucideMessagesSquare,
  lucideMoon,
  lucideSun,
} from '@ng-icons/lucide';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import { HlmFieldImports } from '@spartan-ng/helm/field';
import { HlmInputImports } from '@spartan-ng/helm/input';
import { HlmInputGroupImports } from '@spartan-ng/helm/input-group';
import { HlmSpinnerImports } from '@spartan-ng/helm/spinner';
import { HlmTabsImports } from '@spartan-ng/helm/tabs';
import { HlmTooltipImports } from '@spartan-ng/helm/tooltip';
import { map, merge, type Subscription, take } from 'rxjs';
import { KEEP_CALLER_FAILURE } from '../../../core/auth/caller.service';
import { type OidcProvider, OidcService, oidcProviderOf } from '../../../core/auth/oidc.service';
import { SessionService } from '../../../core/auth/session.service';
import { EnvironmentService } from '../../../core/config/environment.service';
import { ThemeService } from '../../../core/config/theme.service';
import { apiErrorDetail, asSentence } from '../../../core/errors/error-message';
import { withoutTrailingSlashes } from '../../../core/instance-url';
import { NotifyService } from '../../../core/notify/notify.service';
import { DiploLogo } from '../../../shared/brand/diplo-logo';
import { Guilloche } from '../../../shared/brand/guilloche';
import { focusFieldToFix, showFieldsToFix } from '../../../shared/forms/field-to-fix';
import { type SignInAs, takeSignInAs } from '../../../core/auth/sign-in-as';
import { WalletPhone } from './wallet-phone';
import {
  appPath,
  keepSsoReturnUrl,
  type LinkedInstanceReceives,
  linkedInstanceQuestion,
  type PreviousSession,
  signInFailure,
  ssoStartFailure,
  takeSsoReturnUrl,
} from './sign-in';

type LoginMode = 'sso' | 'client';

/** What the check of the instance found: `oidc` offers SSO, `local` only client credentials. */
type InstanceMode = null | 'loading' | 'local' | 'oidc';

/** A check of whether the instance at `url` offers SSO. */
interface InstanceCheck {
  readonly url: string;
  done?: Promise<void>;
}

/**
 * The login page. It signs in with the identity provider of the instance (SSO), or with a
 * client ID and secret; which one the instance offers it learns from its discovery document.
 * A session that keeps its credentials but cannot renew its token, for example while the
 * backend restarts, resumes here instead of asking for them again, and a session that ended
 * says why and prefills its client and instance.
 */
@Component({
  selector: 'app-login',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    NgIcon,
    HlmButtonImports,
    HlmFieldImports,
    HlmInputImports,
    HlmInputGroupImports,
    HlmSpinnerImports,
    HlmTabsImports,
    HlmTooltipImports,
    DiploLogo,
    Guilloche,
    WalletPhone,
    NgTemplateOutlet,
  ],
  providers: [
    provideIcons({
      lucideBookOpen,
      lucideBuilding2,
      lucideCircleHelp,
      lucideCodeXml,
      lucideEye,
      lucideEyeOff,
      lucideGlobe,
      lucideKeyRound,
      lucideMessagesSquare,
      lucideMoon,
      lucideSun,
    }),
  ],
  host: { class: 'block' },
  templateUrl: './login.html',
  styles: `
    /* Sized in percentages of the page, so the gradients scale with any screen. */
    .backdrop {
      background:
        radial-gradient(55% 60% at 6% 0%, rgb(124 132 255 / 0.38), transparent 70%),
        radial-gradient(45% 50% at 96% 0%, rgb(52 61 255 / 0.14), transparent 70%),
        radial-gradient(50% 55% at 100% 100%, rgb(255 183 135 / 0.45), transparent 70%),
        radial-gradient(50% 50% at 30% 100%, rgb(190 194 255 / 0.5), transparent 72%),
        linear-gradient(180deg, #f8f8ff, #f2f3fb);
    }
    :host-context(.dark) .backdrop {
      background:
        radial-gradient(55% 60% at 6% 0%, rgb(52 61 255 / 0.34), transparent 70%),
        radial-gradient(45% 50% at 96% 0%, rgb(124 132 255 / 0.12), transparent 70%),
        radial-gradient(50% 55% at 100% 100%, rgb(150 73 0 / 0.32), transparent 70%),
        radial-gradient(50% 50% at 30% 100%, rgb(27 33 96 / 0.75), transparent 72%),
        linear-gradient(180deg, #070f24, #0a1124);
    }
    /* The phone fits the screen's height; zoom, unlike a transform, shrinks its room too. */
    @media (max-height: 920px) {
      .phone-stage {
        zoom: 0.86;
      }
    }
    @media (max-height: 820px) {
      .phone-stage {
        zoom: 0.74;
      }
    }
    @media (max-height: 720px) {
      .phone-stage {
        zoom: 0.62;
      }
    }
    @media (min-height: 1120px) and (min-width: 1800px) {
      .phone-stage {
        zoom: 1.14;
      }
    }
    @media (min-height: 1300px) and (min-width: 2200px) {
      .phone-stage {
        zoom: 1.34;
      }
    }
  `,
})
export class Login implements OnInit, OnDestroy {
  private readonly formBuilder = inject(FormBuilder);
  private readonly session = inject(SessionService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly notify = inject(NotifyService);
  private readonly environment = inject(EnvironmentService);
  private readonly oidc = inject(OidcService);
  private readonly injector = inject(Injector);
  protected readonly theme = inject(ThemeService);

  loginForm!: FormGroup;
  protected readonly isDevelopmentMode = this.environment.isDevelopment();
  readonly loading = signal(false);
  readonly hideClientSecret = signal(true);
  readonly detectedMode = signal<InstanceMode>(null);
  readonly selectedLoginMode = signal<LoginMode>('sso');
  /** The kept session this page waits for instead of showing the form. */
  readonly keptSession = signal<PreviousSession | null>(null);
  /** The client another page asked to sign in as, such as the admin client of a new tenant. */
  private handover?: SignInAs;
  readonly retryingKeptSession = signal(false);

  private discoveredIssuer?: string;
  private discoveredUiClientId?: string;
  private discoveredProvider?: OidcProvider;
  /**
   * The session this page resumes or that just ended: the form starts from it, and only a
   * sign-in as the same client returns to its page.
   */
  private previousSession?: PreviousSession;
  /** The in-app page the guard sent the user away from. */
  private returnUrl?: string;
  private keptSessionEvents?: Subscription;
  private readonly formElement = viewChild<ElementRef<HTMLFormElement>>('formElement');
  private readonly apiUrlInput = viewChild<ElementRef<HTMLInputElement>>('apiUrlInput');
  private readonly clientSecretInput = viewChild<ElementRef<HTMLInputElement>>('clientSecretInput');
  /** An ended session signed in with client credentials, so the form stays on that tab even where SSO is offered. */
  private keepClientCredentialsTab = false;
  /** The last check of whether an instance offers SSO; an earlier one that answers late is ignored. */
  private instanceCheck?: InstanceCheck;
  /** A submit on the SSO tab waits for the instance check. */
  private waitingForInstanceCheck = false;
  /**
   * The instance the link chose that the user agreed to sign in at, and what it receives then,
   * so a retry does not ask again.
   */
  private confirmedInstance?: { url: string; receives: LinkedInstanceReceives };

  readonly isSsoAvailable = computed(() => this.detectedMode() === 'oidc');
  readonly isSsoTabDisabled = computed(() => this.detectedMode() === 'local');

  readonly submitLabel = computed(() =>
    this.selectedLoginMode() === 'sso' ? 'Continue with SSO' : 'Sign in'
  );

  readonly loadingLabel = computed(() =>
    this.selectedLoginMode() === 'sso' ? 'Redirecting to the identity provider…' : 'Signing in…'
  );

  /**
   * Why the sign-in button cannot be used now, for its tooltip; empty while it can. Missing or
   * invalid fields are no such reason: submitting says which ones to fix.
   */
  readonly loginUnavailableReason = computed(() => {
    if (this.loading()) {
      return this.selectedLoginMode() === 'sso'
        ? 'Redirecting to the identity provider…'
        : 'Signing in…';
    }
    // Without a valid instance URL, the URL is what to fix. A submit waits for the check.
    return this.selectedLoginMode() === 'sso' &&
      this.apiUrlValid() &&
      this.detectedMode() === 'loading'
      ? 'Checking whether this instance offers SSO…'
      : '';
  });

  /**
   * The reason to show under the button: only while it waits for the instance check. While it
   * signs in, the button's own label says so.
   */
  readonly unavailableHint = computed(() => (this.loading() ? '' : this.loginUnavailableReason()));

  /** What the instance check found, for the field's status; nothing while the address is not valid. */
  readonly instanceStatus = computed(() => (this.apiUrlValid() ? this.detectedMode() : null));

  /** Changes with each form event, so computed values that read the form follow it. */
  private readonly formVersion = signal(0);
  private readonly apiUrlValid = computed(() => {
    this.formVersion();
    return !!this.loginForm && this.apiUrlControl.valid;
  });

  ngOnInit(): void {
    // Taken first, so it leaves the history entry whatever this page does next.
    this.handover = takeSignInAs();
    // Check if user is already authenticated. An SSO sign-in returns to the login page
    // without its query, so the page to open was kept for the tab.
    const keptReturnUrl = takeSsoReturnUrl();
    this.returnUrl = appPath(this.route.snapshot.queryParams['returnUrl'] ?? keptReturnUrl);
    if (this.session.getAuthenticationStatus()) {
      void this.continueToApp();
      return;
    }
    if (this.session.hasKeptSession()) {
      this.waitForKeptSession();
    } else {
      // The session may have expired or been rejected before this page opened.
      this.reportEndedSession();
    }
    this.initializeForm();

    const initialApiUrl = this.loginForm.get('apiUrl')?.value;
    if (initialApiUrl) {
      void this.detectMode(initialApiUrl);
    }

    // Auto-login if all required params are provided via URL
    this.autoLoginIfParamsProvided();
  }

  ngOnDestroy(): void {
    this.keptSessionEvents?.unsubscribe();
  }

  /** Waits until the kept session renews its token or ends, instead of asking for credentials it has. */
  private waitForKeptSession(): void {
    this.previousSession = {
      clientId: this.session.getClientId(),
      baseUrl: this.session.getBaseUrl(),
    };
    this.keptSession.set(this.previousSession);
    this.keptSessionEvents = merge(
      this.session.tokenRenewed$.pipe(map(() => true)),
      this.session.sessionEnded$.pipe(map(() => false))
    )
      .pipe(take(1))
      .subscribe((resumed) => {
        if (resumed) {
          // The resuming status stays until the next page opens.
          void this.continueToApp().finally(() => this.keptSession.set(null));
          return;
        }
        this.showForm();
        this.reportEndedSession();
      });
    // Nothing may be due soon, for example after the laptop slept past the token's expiry.
    // This joins a renewal already in flight; failures are retried or end the session.
    void this.session.refreshAccessToken().catch(() => undefined);
  }

  /** Says why the previous session ended; the form starts from its client and instance. */
  private reportEndedSession(): void {
    const ended = this.session.takeEndedSession();
    if (!ended) return;
    this.previousSession = { clientId: ended.clientId, baseUrl: ended.baseUrl };
    this.keepClientCredentialsTab = true;
    this.selectedLoginMode.set('client');
    if (ended.reason === 'expired') {
      // Only the secret is left to enter. Rejected credentials may need another client.
      afterNextRender(() => this.clientSecretInput()?.nativeElement.focus(), {
        injector: this.injector,
      });
      this.notify.warning(`The session of ${ended.clientId} expired. Sign in again to continue.`);
    } else {
      this.notify.error(
        `The credentials of ${ended.clientId} were rejected, for example because the client was deleted or its secret changed. Sign in again.`,
        { duration: 10_000 }
      );
    }
  }

  /** Renews the kept session now instead of waiting for the next automatic attempt. */
  async retryKeptSession(): Promise<void> {
    this.retryingKeptSession.set(true);
    try {
      await this.session.refreshAccessToken();
    } catch (error) {
      // A rejection ends the session, and waitForKeptSession reports it.
      if (this.keptSession()) {
        const reason =
          error instanceof OAuth2HttpError
            ? `The token request failed with status ${error.httpCode}`
            : 'The backend still cannot be reached';
        this.notify.error(`${reason}. This page keeps trying.`);
      }
    } finally {
      this.retryingKeptSession.set(false);
    }
  }

  /** Forgets the kept session, so the user can sign in with other credentials. */
  discardKeptSession(): void {
    this.stopWaitingForKeptSession();
    this.session.logout();
    // Another client or instance may lack the page the old session was on.
    this.returnUrl = undefined;
    this.showForm();
  }

  /** Shows the form in place of the kept session and moves focus to its first field. */
  private showForm(): void {
    this.keptSession.set(null);
    afterNextRender(() => this.apiUrlInput()?.nativeElement.focus(), { injector: this.injector });
  }

  private stopWaitingForKeptSession(): void {
    this.keptSessionEvents?.unsubscribe();
    this.keptSessionEvents = undefined;
    this.keptSession.set(null);
  }

  /**
   * Opens the page the guard sent the user away from, or the dashboard. Resolves when the
   * guards, which wait for the caller's roles, have decided. When that page is refused, for
   * example because the roles could not be loaded, or does not exist, the dashboard opens
   * instead, whose account menu offers Log out. A failed navigation, for example a page whose
   * code the browser could not load after an update, is no failed sign-in, but the user learns
   * what to do.
   */
  private async continueToApp(): Promise<void> {
    const target = this.returnUrl ?? '/dashboard';
    let failure: unknown;
    try {
      if (await this.router.navigateByUrl(target)) return;
    } catch (error) {
      console.error('Opening the page after sign-in failed:', error);
      failure = error;
    }
    if (target !== '/dashboard' && this.router.url.startsWith('/login')) {
      try {
        // Its guards reuse a failure to load the roles, whose Retry opens the page asked for.
        if (await this.router.navigateByUrl('/dashboard', { state: KEEP_CALLER_FAILURE })) {
          if (failure !== undefined) {
            this.reportFailedNavigation(
              failure,
              `${target} could not be opened`,
              'The dashboard opened instead.'
            );
          }
          return;
        }
      } catch (error) {
        console.error('Opening the dashboard after sign-in failed:', error);
        failure = error;
      }
    }
    if (failure !== undefined) {
      this.reportFailedNavigation(
        failure,
        'Signed in, but the page could not be opened',
        'Reload the page.'
      );
    }
  }

  private reportFailedNavigation(error: unknown, failure: string, next: string): void {
    // The router's own error for an address without a page (NG04002) means nothing to users.
    const reason = apiErrorDetail(error)?.startsWith('NG04002')
      ? 'no page has this address'
      : apiErrorDetail(error);
    this.notify.error(`${asSentence(reason ? `${failure}: ${reason}` : failure)} ${next}`);
  }

  private autoLoginIfParamsProvided(): void {
    const queryParams = this.route.snapshot.queryParams;
    const fromLink =
      queryParams['clientId'] && queryParams['clientSecret'] && queryParams['apiUrl'];
    if (fromLink || this.handover) {
      this.selectedLoginMode.set('client');
      this.syncLoginModeState();
      void this.onSubmit();
    }
  }

  private initializeForm(): void {
    const env = this.environment.getEnvironment();
    const queryParams = this.route.snapshot.queryParams;
    const kept = this.previousSession;
    const runtime = (globalThis as { env?: Record<string, string | undefined> }).env;

    // Priority: a client another page handed over > URL params > the previous session >
    // environment values (in dev) > env.js > empty
    const initial = (paramName: string, envValue: string, keptValue?: string): string =>
      queryParams[paramName] ||
      keptValue ||
      (this.environment.isDevelopment() && envValue) ||
      runtime?.[paramName] ||
      '';

    this.loginForm = this.formBuilder.group({
      clientId: [
        this.handover?.clientId || initial('clientId', env.oidc.clientId, kept?.clientId),
        [Validators.required],
      ],
      clientSecret: [
        this.handover?.clientSecret || initial('clientSecret', env.oidc.clientSecret),
        [Validators.required],
      ],
      apiUrl: [
        this.handover?.apiUrl || initial('apiUrl', env.api.baseUrl, kept?.baseUrl),
        [Validators.required, Validators.pattern(/^https?:\/\/.+/)],
      ],
    });
    this.loginForm.events.subscribe(() => this.formVersion.update((version) => version + 1));
  }

  onApiUrlBlur(): void {
    const url = this.loginForm.get('apiUrl')?.value;
    if (url) {
      void this.detectMode(url);
    }
  }

  onLoginTabChange(mode: string): void {
    const selected: LoginMode = mode === 'sso' ? 'sso' : 'client';
    this.selectedLoginMode.set(selected);
    // The user chose SSO after an ended session; detecting the mode again keeps that choice.
    if (selected === 'sso') this.keepClientCredentialsTab = false;
    this.syncLoginModeState();
  }

  private setClientCredentialValidators(required: boolean): void {
    const clientIdControl = this.loginForm.get('clientId');
    const clientSecretControl = this.loginForm.get('clientSecret');

    if (required) {
      clientIdControl?.setValidators([Validators.required]);
      clientSecretControl?.setValidators([Validators.required]);
    } else {
      clientIdControl?.clearValidators();
      clientSecretControl?.clearValidators();
    }

    clientIdControl?.updateValueAndValidity({ emitEvent: false });
    clientSecretControl?.updateValueAndValidity({ emitEvent: false });
  }

  private syncLoginModeState(): void {
    const mode = this.detectedMode();
    const requiresClientCredentials =
      this.selectedLoginMode() === 'client' || mode === 'local' || mode === null;
    this.setClientCredentialValidators(requiresClientCredentials);
  }

  /** Checks whether the instance at `apiUrl` offers SSO and opens the tab to sign in with. */
  private detectMode(apiUrl: string): Promise<void> {
    const check: InstanceCheck = { url: withoutTrailingSlashes(apiUrl) };
    this.instanceCheck = check;
    check.done = this.checkInstance(check);
    return check.done;
  }

  /**
   * Waits until the instance URL the field holds is checked: by the check running or done for
   * it, else a new one, and again when the URL changes meanwhile.
   */
  private async instanceInFieldChecked(): Promise<void> {
    const url = withoutTrailingSlashes(this.apiUrlControl.value);
    if (this.instanceCheck?.url !== url) void this.detectMode(url);
    const check = this.instanceCheck;
    await check?.done;
    // A newer check started meanwhile, for an edited URL or after leaving the field again.
    if (check !== this.instanceCheck) await this.instanceInFieldChecked();
  }

  private async checkInstance(check: InstanceCheck): Promise<void> {
    const normalizedUrl = check.url;
    this.detectedMode.set('loading');

    try {
      const discovery = await this.session.fetchDiscovery(normalizedUrl);
      // A check started since then decides.
      if (this.instanceCheck !== check) return;

      if (discovery?.ui_client_id) {
        this.detectedMode.set('oidc');
        // Another instance than the ended session's opens like a fresh login page.
        const sameInstance = normalizedUrl === this.previousSession?.baseUrl;
        this.selectedLoginMode.set(
          this.keepClientCredentialsTab && sameInstance ? 'client' : 'sso'
        );
        this.discoveredIssuer = discovery.issuer;
        this.discoveredUiClientId = discovery.ui_client_id;
        this.discoveredProvider = oidcProviderOf(discovery.oidc_provider);
      } else {
        this.useClientCredentialsOnly();
      }
    } catch {
      if (this.instanceCheck !== check) return;
      this.useClientCredentialsOnly();
    }

    this.syncLoginModeState();
  }

  private useClientCredentialsOnly(): void {
    this.detectedMode.set('local');
    this.selectedLoginMode.set('client');
    this.discoveredIssuer = undefined;
    this.discoveredUiClientId = undefined;
  }

  private get apiUrlControl(): AbstractControl {
    return this.loginForm.get('apiUrl')!;
  }

  async onSubmit(): Promise<void> {
    // The button stays focusable while it is unavailable, so a click still lands here.
    if (this.loading() || this.waitingForInstanceCheck) return;
    if (this.selectedLoginMode() === 'sso') {
      // SSO needs only the instance URL; the client credentials are on the other tab.
      if (this.apiUrlControl.invalid) {
        this.showFieldsToFix(this.apiUrlControl);
        return;
      }
      // A click right after leaving the instance field comes while its check runs, and Enter in
      // the field comes before the URL it holds was checked.
      this.waitingForInstanceCheck = true;
      try {
        await this.instanceInFieldChecked();
      } finally {
        this.waitingForInstanceCheck = false;
      }
      if (this.apiUrlControl.invalid) {
        this.showFieldsToFix(this.apiUrlControl);
        return;
      }
      if (this.selectedLoginMode() !== 'sso') {
        this.askForClientCredentials();
        return;
      }
    } else if (this.loginForm.invalid) {
      this.showFieldsToFix(this.loginForm);
      return;
    }

    const formValue = this.loginForm.value;
    const normalizedUrl = withoutTrailingSlashes(formValue.apiUrl);
    if (!this.confirmInstanceFromLink(normalizedUrl)) return;

    // Signing in with the form replaces a kept session.
    this.stopWaitingForKeptSession();
    this.loading.set(true);
    let signedIn = false;

    try {
      if (this.selectedLoginMode() === 'sso') {
        const issuerUrl = this.discoveredIssuer;
        const uiClientId = this.discoveredUiClientId;

        if (!issuerUrl || !uiClientId) {
          throw new Error('OIDC mode detected but discovery metadata is incomplete.');
        }

        keepSsoReturnUrl(this.returnUrl);
        try {
          await this.oidc.redirectToLogin({
            issuerUrl,
            uiClientId,
            apiUrl: normalizedUrl,
            provider: this.discoveredProvider,
          });
        } catch (error) {
          console.error('SSO sign-in failed:', error);
          takeSsoReturnUrl();
          this.notify.error(
            `Sign-in failed. ${ssoStartFailure(error, issuerUrl, this.discoveredProvider)}`
          );
          this.loading.set(false);
        }
        return;
      }

      // A sign-in with the link's own client does not make its instance one the user knows.
      const linkCredentials = this.linkCredentialsInForm();
      await this.session.loginWithClientCredentials(
        formValue.clientId,
        formValue.clientSecret,
        normalizedUrl,
        this.discoveredIssuer
      );

      await this.session.refreshAccessToken();
      if (!linkCredentials) this.session.rememberSignedInInstance(normalizedUrl);

      // Only the previous session's client returns to its page; another one may lack it.
      const previous = this.previousSession;
      if (
        previous &&
        (formValue.clientId !== previous.clientId || normalizedUrl !== previous.baseUrl)
      ) {
        this.returnUrl = undefined;
      }
      signedIn = true;
    } catch (error) {
      console.error('Sign-in failed:', error);
      this.notify.error(`Sign-in failed. ${signInFailure(error)}`);
    }
    if (signedIn) {
      // The form stays busy until the next page opens.
      await this.continueToApp();
    }
    this.loading.set(false);
  }

  /**
   * Whether to sign in at `url`. The instance receives the access token or the client secret,
   * and nothing ties it to the identity provider it names. So the user confirms an instance that
   * the link opening this page chose, unless the console knows it already. This also applies to
   * a link with its own credentials. An agreement covers only what the instance receives with it:
   * agreeing to the link's client does not cover sending it the access token of an SSO.
   */
  private confirmInstanceFromLink(url: string): boolean {
    const link = this.route.snapshot.queryParams;
    const linked: unknown = link['apiUrl'];
    if (typeof linked !== 'string' || withoutTrailingSlashes(linked) !== url) return true;
    const receives = this.linkedInstanceReceives();
    const confirmed = this.confirmedInstance;
    if (confirmed?.url === url && confirmed.receives === receives) return true;
    if (this.knownInstances().includes(url)) return true;
    if (globalThis.confirm(linkedInstanceQuestion(url, receives))) {
      this.confirmedInstance = { url, receives };
      return true;
    }
    if (this.keptSession()) {
      // The page keeps waiting for the kept session instead of showing the form.
      this.notify.warning(`Not signed in at ${url}. The previous session continues.`);
      return false;
    }
    // The link's client belongs to the instance the user declined.
    if (this.linkCredentialsInForm()) this.loginForm.patchValue({ clientId: '', clientSecret: '' });
    this.notify.warning(
      `Not signed in at ${url}. Enter the address of an EUDIPLO instance you trust.`
    );
    afterNextRender(() => this.apiUrlInput()?.nativeElement.focus(), { injector: this.injector });
    return false;
  }

  /** The form still holds the client ID and secret of the link that opened this page. */
  private linkCredentialsInForm(): boolean {
    const link = this.route.snapshot.queryParams;
    const { clientId, clientSecret } = this.loginForm.value;
    return (
      !!link['clientSecret'] &&
      clientId === link['clientId'] &&
      clientSecret === link['clientSecret']
    );
  }

  /** What the instance receives when the user signs in with the form as it is. */
  private linkedInstanceReceives(): LinkedInstanceReceives {
    if (this.selectedLoginMode() === 'sso') return 'token';
    return this.linkCredentialsInForm() ? 'link-client' : 'secret';
  }

  /** The instance this deployment of the console names, and the one this browser last signed in to. */
  private knownInstances(): string[] {
    const runtime = (globalThis as { env?: { apiUrl?: string } }).env?.apiUrl;
    // The production build only has a placeholder.
    const development = this.environment.isDevelopment()
      ? this.environment.getEnvironment().api.baseUrl
      : undefined;
    return [runtime, development, this.session.lastSignedInInstance()]
      .filter((url): url is string => !!url)
      .map(withoutTrailingSlashes);
  }

  private showFieldsToFix(fields: AbstractControl): void {
    showFieldsToFix(fields, {
      notify: this.notify,
      injector: this.injector,
      container: () => this.formElement()?.nativeElement,
    });
  }

  /**
   * After a submit on the SSO tab opened the Client ID and Secret tab, says so and focuses the
   * client ID, or the first field to fix, instead of signing in a way the user did not choose.
   */
  private askForClientCredentials(): void {
    this.loginForm.markAllAsTouched();
    this.notify.error(
      'SSO is not available for this instance. Sign in with a client ID and secret.'
    );
    const container = () => this.formElement()?.nativeElement;
    focusFieldToFix(this.injector, container, {
      fallback: () => container()?.querySelector<HTMLElement>('[formcontrolname="clientId"]'),
    });
  }

  toggleClientSecretVisibility(): void {
    this.hideClientSecret.update((hidden) => !hidden);
  }
}
