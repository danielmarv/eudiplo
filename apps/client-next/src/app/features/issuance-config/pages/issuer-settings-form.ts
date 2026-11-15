import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  type ElementRef,
  effect,
  inject,
  Injector,
  input,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NgTemplateOutlet } from '@angular/common';
import { type AbstractControl, type FormArray, ReactiveFormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import {
  issuanceConfigControllerStoreIssuanceConfiguration,
  type IssuanceConfig,
} from '@eudiplo/sdk-core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideArrowDown,
  lucideArrowLeft,
  lucideArrowRight,
  lucideArrowUp,
  lucideBraces,
  lucideChevronDown,
  lucideExternalLink,
  lucidePlus,
  lucideRefreshCw,
  lucideTrash2,
  lucideTriangleAlert,
} from '@ng-icons/lucide';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import { HlmDialogImports } from '@spartan-ng/helm/dialog';
import { HlmFieldImports } from '@spartan-ng/helm/field';
import { HlmInputImports } from '@spartan-ng/helm/input';
import { HlmNativeSelectImports } from '@spartan-ng/helm/native-select';
import { HlmSkeletonImports } from '@spartan-ng/helm/skeleton';
import { HlmSpinnerImports } from '@spartan-ng/helm/spinner';
import { HlmSwitchImports } from '@spartan-ng/helm/switch';
import { HlmTextareaImports } from '@spartan-ng/helm/textarea';
import { HlmTooltipImports } from '@spartan-ng/helm/tooltip';
import {
  injectMutation,
  injectQuery,
  mutationOptions,
  QueryClient,
} from '@tanstack/angular-query-experimental';
import { map, merge, startWith } from 'rxjs';
import { CallerService } from '../../../core/auth/caller.service';
import { SessionService } from '../../../core/auth/session.service';
import { frontendConfigQuery } from '../../../core/config/frontend-config';
import { getApiErrorMessage } from '../../../core/errors/error-message';
import { NotifyService } from '../../../core/notify/notify.service';
import {
  configOwnershipQuery,
  fileManaged,
  lockReason,
} from '../../../shared/config-ownership/config-ownership';
import { OwnershipNotice } from '../../../shared/config-ownership/ownership-notice';
import { ImageField } from '../../../shared/forms/image-field';
import { PageHeader } from '../../../shared/pages/page-header';
import { FederationTrustAnchorSelect } from '../../federation-trust-anchors/components/federation-trust-anchor-select';
import { federationTrustAnchorsQuery } from '../../federation-trust-anchors/data/federation-trust-anchor-queries';
import { issuanceConfigQuery } from '../../issuance/data/issuance-queries';
import { keyChainsQuery } from '../../keys/data/key-queries';
import { presentationConfigsQuery } from '../../presentation-configs/data/presentation-config-queries';
import { registrarConfigQuery } from '../../registrar/data/registrar-queries';
import { trustListsQuery } from '../../trust-lists/data/trust-list-queries';
import {
  createDisplayGroup,
  createIssuerSettingsForm,
  createServerGroup,
  createTrustAnchorGroup,
  createTrustListGroup,
  defaultTokenLifetime,
  entityConfigurationUri,
  fillIssuerSettingsForm,
  issuerSettingsBody,
  pinnedKey,
  type ServerGroup,
  SERVER_TYPES,
  type ServerType,
  serverProblems,
  type TrustListGroup,
} from '../data/issuer-settings-form';
import { statusCheckModeLabel } from '../data/issuer-settings';

const STEPS = ['Identity', 'Wallet access', 'Trust', 'Review'] as const;
type Step = 0 | 1 | 2 | 3;
type Rec = Record<string, unknown>;

const LOCALES = [
  { value: 'en-US', label: 'English (United States)' },
  { value: 'en-GB', label: 'English (United Kingdom)' },
  { value: 'de-DE', label: 'German (Germany)' },
  { value: 'fr-FR', label: 'French (France)' },
  { value: 'it-IT', label: 'Italian (Italy)' },
  { value: 'es-ES', label: 'Spanish (Spain)' },
];

/**
 * Edits the issuer settings (`/issuance-config/edit`): the issuer's name and logo, the
 * authorization servers wallets get tokens from and how issuance behaves, and what the issuer
 * trusts (transaction codes, wallet providers, OpenID Federation, its registration certificate).
 * Without a name yet, or with `?setup=true`, it goes step by step with a review at the end.
 */
@Component({
  selector: 'app-issuer-settings-form',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    NgTemplateOutlet,
    ReactiveFormsModule,
    RouterLink,
    NgIcon,
    HlmButtonImports,
    HlmDialogImports,
    HlmFieldImports,
    HlmInputImports,
    HlmNativeSelectImports,
    HlmSkeletonImports,
    HlmSpinnerImports,
    HlmSwitchImports,
    HlmTextareaImports,
    HlmTooltipImports,
    FederationTrustAnchorSelect,
    ImageField,
    OwnershipNotice,
    PageHeader,
  ],
  providers: [
    provideIcons({
      lucideArrowDown,
      lucideArrowLeft,
      lucideArrowRight,
      lucideArrowUp,
      lucideBraces,
      lucideChevronDown,
      lucideExternalLink,
      lucidePlus,
      lucideRefreshCw,
      lucideTrash2,
      lucideTriangleAlert,
    }),
  ],
  templateUrl: './issuer-settings-form.html',
})
export class IssuerSettingsForm {
  /** `?setup=true` asks for the step-by-step setup. */
  readonly setup = input<string>();

  private readonly instance = inject(SessionService).getBaseUrl();
  private readonly caller = inject(CallerService).loadedCaller;
  private readonly tenant = computed(() => this.caller()?.tenantId);
  private readonly router = inject(Router);
  private readonly notify = inject(NotifyService);
  private readonly queryClient = inject(QueryClient);
  private readonly injector = inject(Injector);
  private readonly destroyRef = inject(DestroyRef);
  private readonly formElement = viewChild<ElementRef<HTMLFormElement>>('formElement');

  protected readonly stored = injectQuery(() => issuanceConfigQuery(this.instance, this.tenant()));
  private readonly ownership = injectQuery(() =>
    configOwnershipQuery(this.instance, this.tenant(), 'IssuanceConfig')
  );
  protected readonly owner = computed(() => this.ownership.data()?.[0]);
  protected readonly locked = computed(() => {
    const managed = fileManaged(this.ownership.data()).values().next().value;
    return managed ? lockReason(managed) : '';
  });
  protected readonly presentationConfigs = injectQuery(() =>
    presentationConfigsQuery(this.instance, this.tenant())
  );
  protected readonly keyChains = injectQuery(() => keyChainsQuery(this.instance, this.tenant()));
  protected readonly trustListsAll = injectQuery(() =>
    trustListsQuery(this.instance, this.tenant())
  );
  private readonly anchors = injectQuery(() =>
    federationTrustAnchorsQuery(this.instance, this.tenant())
  );
  private readonly registrar = injectQuery(() =>
    registrarConfigQuery(this.instance, this.tenant())
  );
  private readonly frontendConfig = injectQuery(() => frontendConfigQuery(this.instance));
  private readonly save_ = injectMutation(() =>
    mutationOptions({
      mutationFn: async (body: ReturnType<typeof issuerSettingsBody>) =>
        (await issuanceConfigControllerStoreIssuanceConfiguration({ body })).data,
    })
  );
  protected readonly saving = this.save_.isPending;

  protected readonly form = createIssuerSettingsForm();
  protected readonly value = toSignal(
    merge(this.form.valueChanges, this.form.statusChanges).pipe(
      startWith(null),
      map(() => this.form.getRawValue())
    ),
    { requireSync: true }
  );
  /** Federation settings the form does not edit, sent back unchanged. */
  private carried: Rec = {};
  /** Trust anchors of the stored settings, which the backend keeps even when unregistered. */
  private storedAnchors = new Set<string>();
  protected readonly wasPublished = signal(false);
  protected readonly carriedNames = signal<string[]>([]);

  // ---- Steps ----

  protected readonly steps = STEPS;
  protected readonly guided = signal(false);
  protected readonly step = signal<Step>(0);
  protected readonly furthest = signal<Step>(0);
  protected readonly stepError = signal('');
  protected readonly openServers = signal<ReadonlySet<AbstractControl>>(new Set());

  protected readonly locales = LOCALES;
  protected readonly serverTypes = SERVER_TYPES;
  protected readonly defaultTokenLifetime = defaultTokenLifetime;
  protected readonly pinnedKey = pinnedKey;

  /** The keys of usage authorization server, which sign the access tokens. */
  protected readonly serverKeys = computed(() =>
    (this.keyChains.data() ?? []).filter((chain) => chain.usageType === 'authorizationServer')
  );
  /** The tenant's trust lists that name a wallet provider, the only ones an attestation can match. */
  protected readonly walletProviderLists = computed(() =>
    (this.trustListsAll.data() ?? []).filter((list) =>
      list.entityConfig?.some((entity) => entity['providerType'] === 'wallet-provider')
    )
  );
  protected readonly issuerStatusCheck = computed(() =>
    statusCheckModeLabel((this.value().statusCheck || undefined) as never)
  );

  /** Where EUDIPLO serves the tenant's entity configuration, from its public URL. */
  protected readonly expectedEntityId = computed(() => {
    const config = this.frontendConfig.data();
    const base = (config?.publicUrl || this.instance || '').replace(/\/+$/, '');
    const tenant = this.tenant();
    return config && tenant && base ? `${base}/issuers/${tenant}` : null;
  });
  protected readonly entityIdDiffers = computed(() => {
    const entityId = this.value().federation.entityId.trim();
    const expected = this.expectedEntityId();
    return !!entityId && !!expected && entityId !== expected;
  });
  /** The key chain `federation.entityKeyChainId` pins, carried over from the stored settings. */
  protected readonly pinnedFederationKey = computed(() => {
    this.carriedNames();
    const pinned = this.carried['entityKeyChainId'];
    return typeof pinned === 'string' && pinned ? pinned : null;
  });
  /** Whether an entity ID is set but no federation key can sign the entity configuration. */
  protected readonly federationKeyMissing = computed(() => {
    if (!this.value().federation.entityId.trim() || !this.keyChains.isSuccess()) return false;
    const keys = (this.keyChains.data() ?? []).filter((chain) => chain.usageType === 'federation');
    const pinned = this.pinnedFederationKey();
    return pinned ? !keys.some((chain) => chain.id === pinned) : !keys.length;
  });
  /** Trust anchors this edit adds that are not registered; the backend refuses them. */
  protected readonly unregisteredAnchors = computed(() => {
    const registered = this.anchors.data();
    if (!registered) return [];
    const ids = new Set(registered.map((anchor) => anchor.entityId));
    return this.value()
      .federation.trustAnchors.map((anchor) => anchor.entityId)
      .filter((id) => id && !ids.has(id) && !this.storedAnchors.has(id));
  });

  protected readonly behaviorSummary = computed(() => {
    const value = this.value();
    return [
      `Batch size ${value.batchSize}`,
      `DPoP ${value.dPopRequired ? 'required' : 'optional'}`,
      `request encryption ${value.credentialRequestEncryption ? 'required' : 'off'}`,
      `response encryption ${value.credentialResponseEncryption ? 'offered' : 'off'}`,
      `notifications ${value.notificationEndpointEnabled ? 'on' : 'off'}`,
    ].join(' · ');
  });
  protected readonly trustSummary = computed(() => {
    const value = this.value();
    return [
      `Wallet attestation ${value.walletAttestationRequired ? 'required' : 'optional'}`,
      `status check ${this.issuerStatusCheck().toLowerCase()}`,
      `${value.trustLists.length} wallet provider ${value.trustLists.length === 1 ? 'list' : 'lists'}`,
      `federation ${value.federation.enabled ? 'on' : 'off'}`,
      `registration certificate ${value.registration.enabled ? value.registration.mode : 'off'}`,
      `PIN attempts ${value.txCodeMaxAttempts ?? 5}`,
    ].join(' · ');
  });

  // ---- JSON view ----

  protected readonly jsonOpen = signal(false);
  protected readonly jsonText = signal('');
  protected readonly jsonError = signal('');

  constructor() {
    let filled = false;
    effect(() => {
      const config = this.stored.data();
      if (!config || filled) return;
      filled = true;
      untracked(() => {
        this.apply(config);
        this.guided.set(!config.display?.length || this.setup() === 'true');
      });
    });
    effect(() => {
      const defaults = this.registrar.data()?.registrationCertificateDefaults as Rec | undefined;
      if (!defaults || !this.stored.isSuccess()) return;
      untracked(() => this.applyRegistrarDefaults(defaults, false));
    });
    effect(() => {
      if (this.locked()) untracked(() => this.form.disable({ emitEvent: false }));
    });
    this.form.controls.displays.valueChanges.subscribe(() => {
      for (const display of this.form.controls.displays.controls) {
        display.controls.locale.updateValueAndValidity({ emitEvent: false });
      }
    });
  }

  private apply(config: IssuanceConfig | Rec): void {
    this.carried = fillIssuerSettingsForm(this.form, config);
    this.carriedNames.set(Object.keys(this.carried));
    const federation = (config as Rec)['federation'] as Rec | undefined;
    const anchors = Array.isArray(federation?.['trustAnchors'])
      ? (federation!['trustAnchors'] as Rec[])
      : [];
    this.storedAnchors = new Set(anchors.map((anchor) => String(anchor['entityId'] ?? '')));
    this.wasPublished.set(!!federation?.['entityId'] && anchors.length > 0);
    if (!this.form.controls.displays.length) this.addDisplay();
    if (this.locked()) this.form.disable({ emitEvent: false });
  }

  // ---- Steps ----

  private validateStep(step: Step): boolean {
    const c = this.form.controls;
    let error = '';
    const controls: AbstractControl[] =
      step === 0
        ? [c.displays]
        : step === 1
          ? [c.servers, c.batchSize]
          : [c.txCodeMaxAttempts, c.trustLists, c.federation, c.registration];
    if (step === 0 && !c.displays.length) error = 'Add the issuer name in at least one language.';
    if (step === 1) error = serverProblems(this.form);
    if (step === 2) {
      const value = this.value();
      if (value.federation.enabled && !value.federation.trustAnchors.length) {
        error = 'Add a trust anchor, or turn OpenID Federation off.';
      } else if (value.federation.enabled && this.unregisteredAnchors().length) {
        error = `Register ${this.unregisteredAnchors().join(', ')} as a federation trust anchor first, or choose a registered one.`;
      } else if (
        value.registration.enabled &&
        value.registration.mode === 'import' &&
        !value.registration.jwt.trim()
      ) {
        error = 'Paste the registration certificate, or let EUDIPLO request one.';
      }
    }
    if (!error && !controls.some((control) => control.invalid)) return true;
    controls.forEach((control) => control.markAllAsTouched());
    if (step === 1) this.openServers.set(new Set(c.servers.controls));
    this.step.set(step);
    this.furthest.update((furthest) => Math.max(furthest, step) as Step);
    this.stepError.set(error || `Check the highlighted fields in ${STEPS[step]}.`);
    afterNextRender(
      () =>
        this.formElement()
          ?.nativeElement.querySelector<HTMLElement>(
            'input.ng-invalid, textarea.ng-invalid, select.ng-invalid'
          )
          ?.focus(),
      { injector: this.injector }
    );
    return false;
  }

  protected goTo(step: number): void {
    if (this.guided() && step > this.furthest()) return;
    this.stepError.set('');
    this.step.set(step as Step);
  }

  protected next(): void {
    this.stepError.set('');
    if (this.saving() || !this.validateStep(this.step())) return;
    const next = Math.min(3, this.step() + 1) as Step;
    this.step.set(next);
    this.furthest.update((furthest) => Math.max(furthest, next) as Step);
  }

  protected back(): void {
    if (this.saving()) return;
    this.stepError.set('');
    this.step.update((step) => Math.max(0, step - 1) as Step);
  }

  protected toggleGuided(): void {
    this.guided.update((guided) => !guided);
    this.step.set(0);
    this.furthest.set(0);
    this.stepError.set('');
  }

  // ---- Displays ----

  protected addDisplay(): void {
    const used = new Set(
      this.form.controls.displays.controls.map((display) =>
        display.controls.locale.value.toLowerCase()
      )
    );
    const locale =
      LOCALES.find((option) => !used.has(option.value.toLowerCase()))?.value ?? 'en-US';
    this.form.controls.displays.push(createDisplayGroup({ locale }));
  }

  /** Whether `locale` is one the select lists; a stored other one is shown as it is. */
  protected knownLocale(locale: string): boolean {
    return LOCALES.some((option) => option.value === locale);
  }

  protected removeDisplay(index: number): void {
    if (this.form.controls.displays.length > 1) this.form.controls.displays.removeAt(index);
  }

  // ---- Servers ----

  protected get servers() {
    return this.form.controls.servers;
  }

  protected addServer(): void {
    const server = createServerGroup();
    this.servers.push(server);
    this.openServers.update((open) => new Set([...open, server]));
  }

  protected removeServer(index: number): void {
    this.servers.removeAt(index);
  }

  protected moveServer(index: number, by: -1 | 1): void {
    const target = index + by;
    if (target < 0 || target >= this.servers.length) return;
    const server = this.servers.at(index);
    this.servers.removeAt(index, { emitEvent: false });
    this.servers.insert(target, server);
  }

  protected toggleServer(server: AbstractControl): void {
    this.openServers.update((open) => {
      const next = new Set(open);
      if (next.has(server)) next.delete(server);
      else next.add(server);
      return next;
    });
  }

  /** Changes the type of a server; a token lifetime left at the old type's default follows. */
  protected setServerType(server: ServerGroup, type: ServerType): void {
    const lifetime = server.controls.tokenLifetime;
    if (!lifetime.dirty && [300, 3600].includes(Number(lifetime.value))) {
      lifetime.setValue(defaultTokenLifetime(type));
    }
    if (type === 'built-in' && !server.controls.label.value)
      server.controls.label.setValue('Built-in Authorization Server');
    server.controls.type.setValue(type);
  }

  protected hasOtherBuiltIn(server: ServerGroup): boolean {
    return this.servers.controls.some(
      (other) => other !== server && other.controls.type.value === 'built-in'
    );
  }

  protected serverKeyUnusable(id: string): boolean {
    return (
      !!id && this.keyChains.isSuccess() && !this.serverKeys().some((chain) => chain.id === id)
    );
  }

  // ---- Trust lists ----

  protected addTrustList(list: FormArray<TrustListGroup>, mode: 'managed' | 'external'): void {
    list.push(createTrustListGroup(undefined, mode));
  }

  /** Why a stored managed list is not among the options, or null when it is or none is chosen. */
  protected managedNote(id: string): string | null {
    if (!id) return null;
    if (!this.trustListsAll.isSuccess()) return 'lists not loaded';
    if (this.walletProviderLists().some((list) => list.id === id)) return null;
    return (this.trustListsAll.data() ?? []).some((list) => list.id === id)
      ? 'no wallet provider'
      : 'not found';
  }

  // ---- Federation ----

  protected get anchorsArray() {
    return this.form.controls.federation.controls.trustAnchors;
  }

  protected addAnchor(): void {
    this.anchorsArray.push(createTrustAnchorGroup());
  }

  protected removeAnchor(index: number): void {
    this.anchorsArray.removeAt(index);
  }

  /** Fills in the entity configuration URI of a picked anchor, unless one of its own is set. */
  protected onAnchorPicked(
    index: number,
    event: { anchor: { entityId: string }; previous: string }
  ): void {
    const uri = this.anchorsArray.at(index).controls.entityConfigurationUri;
    const current = uri.value.trim();
    if (!current || (event.previous && current === entityConfigurationUri(event.previous))) {
      uri.setValue(entityConfigurationUri(event.anchor.entityId));
    }
  }

  protected useExpectedEntityId(): void {
    const expected = this.expectedEntityId();
    if (!expected) return;
    const control = this.form.controls.federation.controls.entityId;
    control.setValue(expected);
    control.markAsDirty();
  }

  protected checkKeysAgain(): void {
    void this.keyChains.refetch();
  }

  // ---- Registration certificate ----

  protected useRegistrarDefaults(): void {
    const defaults = this.registrar.data()?.registrationCertificateDefaults as Rec | undefined;
    if (!defaults) {
      this.notify.info('The registrar has no registration certificate defaults.');
      return;
    }
    this.applyRegistrarDefaults(defaults, true);
    this.notify.success('Privacy policy and support URI taken from the registrar defaults.');
  }

  private applyRegistrarDefaults(defaults: Rec, overwrite: boolean): void {
    const { privacyPolicy, supportUri } = this.form.controls.registration.controls;
    const privacy =
      typeof defaults['privacy_policy'] === 'string' ? defaults['privacy_policy'].trim() : '';
    const support =
      typeof defaults['support_uri'] === 'string' ? defaults['support_uri'].trim() : '';
    if (privacy && (overwrite || !privacyPolicy.value.trim())) privacyPolicy.setValue(privacy);
    if (support && (overwrite || !supportUri.value.trim())) supportUri.setValue(support);
  }

  // ---- JSON ----

  protected openJson(): void {
    try {
      this.jsonText.set(JSON.stringify(issuerSettingsBody(this.form, this.carried), null, 2));
    } catch {
      this.stepError.set('Fix the highlighted settings before you open the JSON.');
      return;
    }
    this.jsonError.set('');
    this.jsonOpen.set(true);
  }

  protected applyJson(): void {
    let config: Rec;
    try {
      config = JSON.parse(this.jsonText()) as Rec;
    } catch (error) {
      this.jsonError.set(`The text is no valid JSON: ${(error as Error).message}`);
      return;
    }
    if (!config || typeof config !== 'object' || Array.isArray(config)) {
      this.jsonError.set('The issuer settings are a JSON object.');
      return;
    }
    this.apply(config);
    this.jsonOpen.set(false);
  }

  // ---- Save ----

  protected submit(): void {
    if (this.guided() && this.step() < 3) {
      this.next();
      return;
    }
    this.save();
  }

  private save(): void {
    if (this.saving() || this.locked() || !this.stored.isSuccess()) return;
    for (let step = 0; step < 3; step++) if (!this.validateStep(step as Step)) return;
    let body: ReturnType<typeof issuerSettingsBody>;
    try {
      body = issuerSettingsBody(this.form, this.carried);
    } catch {
      this.stepError.set('Check the highlighted fields in Trust.');
      this.step.set(2);
      return;
    }
    const registration = body.registrationCertificate as Rec | null | undefined;
    const renewsInBackground =
      !!registration?.['enabled'] &&
      (registration['mode'] ?? 'generate') === 'generate' &&
      (registration['renewal'] ?? 'onCredentialConfigChange') === 'onCredentialConfigChange';
    this.save_.mutate(body, {
      onSuccess: () => {
        if (renewsInBackground) {
          this.notify.success('Issuer settings saved.', {
            description:
              'If the registration certificate inputs changed, EUDIPLO requests a new certificate in the background.',
            duration: 8_000,
          });
        } else {
          this.notify.success('Issuer settings saved.');
        }
        void this.queryClient.invalidateQueries({
          queryKey: issuanceConfigQuery(this.instance, this.tenant()).queryKey,
        });
        if (!this.destroyRef.destroyed) void this.router.navigate(['/issuance-config']);
      },
      onError: (error) =>
        this.notify.error(
          getApiErrorMessage(error, 'Failed to save the issuer settings', { allIssues: true })
        ),
    });
  }

  protected errorMessage(error: unknown): string {
    return getApiErrorMessage(error, 'Failed to load the issuer settings');
  }
}
