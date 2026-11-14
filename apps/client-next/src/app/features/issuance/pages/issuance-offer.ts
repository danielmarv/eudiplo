import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  Injector,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import {
  FormControl,
  FormGroup,
  FormRecord,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { NgTemplateOutlet } from '@angular/common';
import { RouterLink } from '@angular/router';
import type { OfferRequestDto, OfferResponse } from '@eudiplo/sdk-core';
import { FormlyJsonschema } from '@ngx-formly/core/json-schema';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideArrowLeft,
  lucideArrowRight,
  lucideCheck,
  lucideCircleCheck,
  lucideCloudDownload,
  lucideInfo,
  lucideQrCode,
  lucideServer,
  lucideShieldCheck,
  lucideTriangleAlert,
  lucideZap,
} from '@ng-icons/lucide';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import { HlmFieldImports } from '@spartan-ng/helm/field';
import { HlmInputImports } from '@spartan-ng/helm/input';
import { HlmNativeSelectImports } from '@spartan-ng/helm/native-select';
import { HlmSkeletonImports } from '@spartan-ng/helm/skeleton';
import { injectMutation, injectQuery } from '@tanstack/angular-query-experimental';
import { CallerService } from '../../../core/auth/caller.service';
import { SessionService } from '../../../core/auth/session.service';
import { getApiErrorMessage } from '../../../core/errors/error-message';
import { NotifyService } from '../../../core/notify/notify.service';
import {
  firstFieldWithError,
  type FormSection,
  showFieldsToFix,
} from '../../../shared/forms/field-to-fix';
import { PageHeader } from '../../../shared/pages/page-header';
import { ClaimsCard } from '../components/claims-card';
import { CredentialPicker } from '../components/credential-picker';
import { OfferResult } from '../components/offer-result';
import { type ClaimForm, type ClaimSourceKind, createClaimForm } from '../data/claim-form';
import {
  attributeProvidersQuery,
  createOfferMutation,
  credentialConfigsQuery,
  issuanceConfigQuery,
} from '../data/issuance-queries';
import {
  buildOfferRequest,
  claimsForForm,
  configsForFlow,
  formFlowOf,
  isChainedServer,
  type OfferFlow,
  serverOptionsForFlow,
} from '../data/offer-request';

const FLOWS: readonly { value: OfferFlow; icon: string; title: string; detail: string }[] = [
  {
    value: 'pre_authorized_code',
    icon: 'lucideZap',
    title: 'Pre-authorized code',
    detail:
      'You set the claims now. The wallet receives the credential right after scanning the code. For holders you have already identified.',
  },
  {
    value: 'authorization_code_external',
    icon: 'lucideServer',
    title: 'Authorization code, external server',
    detail:
      'An authorization server of the issuer signs the holder in; an attribute provider then resolves the claims.',
  },
  {
    value: 'authorization_code_iae',
    icon: 'lucideShieldCheck',
    title: 'Authorization code, built-in (IAE)',
    detail:
      'The built-in Interactive Authorization Endpoint signs the holder in through the steps each credential configures.',
  },
];

type Step = 0 | 1 | 2;

/**
 * Creates a credential offer, in three steps as in the current Web Client: the flow, the
 * credentials, then what the flow needs (the claims for a pre-authorized offer, the
 * authorization server and attribute providers for an authorization code offer). The created
 * offer shows here with its QR code and its session's progress. An earlier offer handed over in
 * the navigation state (`offerRequest`) fills the steps in.
 */
@Component({
  selector: 'app-issuance-offer',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    NgTemplateOutlet,
    ReactiveFormsModule,
    RouterLink,
    NgIcon,
    HlmButtonImports,
    HlmFieldImports,
    HlmInputImports,
    HlmNativeSelectImports,
    HlmSkeletonImports,
    PageHeader,
    ClaimsCard,
    CredentialPicker,
    OfferResult,
  ],
  providers: [
    provideIcons({
      lucideArrowLeft,
      lucideArrowRight,
      lucideCheck,
      lucideCircleCheck,
      lucideCloudDownload,
      lucideInfo,
      lucideQrCode,
      lucideServer,
      lucideShieldCheck,
      lucideTriangleAlert,
      lucideZap,
    }),
  ],
  templateUrl: './issuance-offer.html',
})
export class IssuanceOffer {
  private readonly notify = inject(NotifyService);
  private readonly injector = inject(Injector);
  private readonly jsonschema = inject(FormlyJsonschema);
  private readonly caller = inject(CallerService);
  private readonly instance = inject(SessionService).getBaseUrl();
  private readonly tenant = computed(() => this.caller.loadedCaller()?.tenantId);

  protected readonly configs = injectQuery(() =>
    credentialConfigsQuery(this.instance, this.tenant())
  );
  protected readonly issuanceConfig = injectQuery(() =>
    issuanceConfigQuery(this.instance, this.tenant())
  );
  private readonly providersQuery = injectQuery(() =>
    attributeProvidersQuery(this.instance, this.tenant())
  );
  private readonly creation = injectMutation(() => createOfferMutation());

  protected readonly flows = FLOWS;
  protected readonly loading = computed(
    () =>
      this.configs.isPending() || this.issuanceConfig.isPending() || this.providersQuery.isPending()
  );
  protected readonly loadError = computed(() => {
    if (this.configs.isError()) {
      return getApiErrorMessage(this.configs.error(), 'Failed to load the credentials');
    }
    if (this.issuanceConfig.isError()) {
      return getApiErrorMessage(this.issuanceConfig.error(), 'Failed to load the issuer settings');
    }
    return '';
  });
  protected readonly providers = computed(() => this.providersQuery.data() ?? []);
  /** The attribute providers could not be loaded, so an empty list says nothing. */
  protected readonly providersFailed = computed(() => this.providersQuery.isError());
  /** Creating credential configurations needs `issuance:manage`. */
  protected readonly managesConfigs = computed(
    () => !!this.caller.loadedCaller()?.roles.includes('issuance:manage')
  );

  protected readonly step = signal<Step>(0);
  protected readonly flow = signal<OfferFlow>('pre_authorized_code');
  protected readonly selected = signal<string[]>([]);
  private readonly claimForms = signal<ReadonlyMap<string, ClaimForm>>(new Map());
  /** Whether Next on the credential step was used without a choice, so the picker says so. */
  protected readonly pickerInvalid = signal(false);

  protected readonly allConfigs = computed(() => this.configs.data() ?? []);
  protected readonly flowConfigs = computed(() => configsForFlow(this.allConfigs(), this.flow()));
  protected readonly serverOptions = computed(() =>
    serverOptionsForFlow(this.issuanceConfig.data(), this.flow())
  );
  protected readonly chosenForms = computed(() =>
    this.selected()
      .map((id) => this.claimForms().get(id))
      .filter((form): form is ClaimForm => !!form)
  );

  protected readonly settings = new FormGroup({
    authorizationServer: new FormControl('', { nonNullable: true }),
    txCode: new FormControl('', { nonNullable: true }),
    txCodeDescription: new FormControl('', { nonNullable: true }),
  });
  /** The last step: the settings, the claims typed into forms and the attribute providers. */
  private readonly stepForm = new FormGroup({
    settings: this.settings,
    claims: new FormRecord<FormGroup>({}),
    providers: new FormRecord<FormControl<string>>({}),
  });
  private readonly settingsChanged = signal(0);
  protected readonly txCodeSet = computed(() => {
    this.settingsChanged();
    return !!this.settings.controls.txCode.value.trim();
  });
  protected readonly selectedServer = computed(() => {
    this.settingsChanged();
    return this.settings.controls.authorizationServer.value;
  });

  protected readonly steps = computed(() => [
    'Flow',
    'Credentials',
    this.flow() === 'pre_authorized_code'
      ? 'Claims'
      : this.flow() === 'authorization_code_external'
        ? 'Authorization server'
        : 'Review',
  ]);

  protected readonly generating = this.creation.isPending;
  protected readonly created = signal<{ response: OfferResponse; txCode?: string } | null>(null);

  private readonly configStep = viewChild<ElementRef<HTMLElement>>('configStep');
  private readonly credentialStep = viewChild<ElementRef<HTMLElement>>('credentialStep');

  constructor() {
    // Reactive forms are no signals; this tick lets the computed values below follow them.
    this.stepForm.valueChanges.subscribe(() => this.settingsChanged.update((count) => count + 1));
    // Once the data has loaded: fill in an earlier offer, or choose the only credential there is.
    let started = false;
    effect(() => {
      if (started || this.loading() || this.loadError()) return;
      started = true;
      untracked(() => this.start());
    });
  }

  private start(): void {
    this.syncServer(this.flow(), true);
    const earlier = (globalThis.history?.state as { offerRequest?: OfferRequestDto } | null)
      ?.offerRequest;
    if (earlier) {
      this.prefill(earlier);
    } else if (this.allConfigs().length === 1 && this.flowConfigs().length === 1) {
      this.setSelected([this.allConfigs()[0].id]);
    }
  }

  /** Why Next on the credential step cannot be used, said beside it; empty while it can. */
  protected readonly credentialStepBlocked = computed(() =>
    this.flowConfigs().length === 0 ? 'No credential configuration fits this flow.' : ''
  );

  /**
   * Why the offer cannot be created now, said beside the button; empty while it can. Missing or
   * invalid fields are no such reason: Create says which ones to fix.
   */
  protected readonly createBlocked = computed(() => {
    this.settingsChanged();
    if (this.flow() !== 'authorization_code_external') return '';
    if (this.serverOptions().length === 0) {
      return 'No authorization server is configured for this flow.';
    }
    const providerMissing = this.chosenForms().some((form) => !form.provider.value);
    if (providerMissing && this.providers().length === 0) {
      return this.providersFailed()
        ? 'The attribute providers could not be loaded.'
        : 'No attribute provider is configured.';
    }
    return '';
  });

  protected chooseFlow(flow: OfferFlow): void {
    if (flow === this.flow()) return;
    this.flow.set(flow);
    // The credentials a flow allows differ, so the choice starts over.
    this.claimForms.set(new Map());
    this.selected.set([]);
    this.pickerInvalid.set(false);
    this.settings.patchValue({ txCode: '', txCodeDescription: '' });
    this.syncServer(flow, true);
    this.rebuildStepForm();
  }

  protected setSelected(ids: string[]): void {
    const forms = new Map(this.claimForms());
    for (const id of forms.keys()) if (!ids.includes(id)) forms.delete(id);
    for (const id of ids) {
      const config = this.allConfigs().find((entry) => entry.id === id);
      if (config && !forms.has(id)) {
        forms.set(
          id,
          createClaimForm(
            config,
            this.jsonschema,
            this.providers(),
            this.flow() === 'authorization_code_external'
          )
        );
      }
    }
    this.claimForms.set(forms);
    this.selected.set(ids);
    if (ids.length) this.pickerInvalid.set(false);
    this.rebuildStepForm();
  }

  protected setSource(form: ClaimForm, source: ClaimSourceKind): void {
    form.source.set(source);
    this.rebuildStepForm();
  }

  /**
   * Puts the chosen credentials' parts into the last step's form: the claims typed into forms of
   * a pre-authorized offer, the attribute provider of each credential otherwise.
   */
  private rebuildStepForm(): void {
    const claims = this.stepForm.controls.claims;
    const providers = this.stepForm.controls.providers;
    const preAuth = this.flow() === 'pre_authorized_code';
    for (const id of Object.keys(claims.controls)) claims.removeControl(id);
    for (const id of Object.keys(providers.controls)) providers.removeControl(id);
    for (const form of this.chosenForms()) {
      if (preAuth && form.source() === 'form') claims.addControl(form.id, form.form);
      if (!preAuth) providers.addControl(form.id, form.provider);
    }
  }

  /**
   * The authorization server of `flow`: the only one, else a valid choice among several, which
   * one must then make. `reset` starts from the first one the issuer configured.
   */
  private syncServer(flow: OfferFlow, reset: boolean): void {
    const control = this.settings.controls.authorizationServer;
    const options = serverOptionsForFlow(this.issuanceConfig.data(), flow);
    const current = control.value;
    const value =
      options.length === 1
        ? options[0].value
        : reset
          ? (options[0]?.value ?? '')
          : options.some((option) => option.value === current)
            ? current
            : '';
    control.setValue(value);
    control.setValidators(options.length > 1 ? Validators.required : []);
    control.updateValueAndValidity();
  }

  protected isChained(id: string): boolean {
    return isChainedServer(this.issuanceConfig.data(), id);
  }

  protected goTo(step: Step): void {
    if (step < this.step()) this.step.set(step);
  }

  protected next(): void {
    if (this.step() === 0) {
      this.step.set(1);
      return;
    }
    if (this.credentialStepBlocked()) return;
    if (!this.selected().length) {
      this.pickerInvalid.set(true);
      this.notify.error('Choose at least one credential.');
      this.credentialStep()
        ?.nativeElement.querySelector<HTMLElement>('#credential-search')
        ?.focus();
      return;
    }
    this.step.set(2);
  }

  private get sections(): FormSection[] {
    const { claims, providers } = this.stepForm.controls;
    return [
      { name: 'Authorization server', controls: [this.settings.controls.authorizationServer] },
      ...this.selected().map((id) => ({
        name: id,
        controls: [claims.get(id), providers.get(id)],
      })),
    ];
  }

  protected create(): void {
    if (this.generating() || this.createBlocked()) return;
    if (!this.selected().length) {
      // An earlier offer opens on the last step, even when it names no credential.
      this.step.set(1);
      this.pickerInvalid.set(true);
      this.notify.error('Choose at least one credential.');
      return;
    }
    if (this.stepForm.invalid) {
      const container = () => this.configStep()?.nativeElement;
      showFieldsToFix(this.stepForm, {
        notify: this.notify,
        injector: this.injector,
        container,
        sections: this.sections,
        field: () => firstFieldWithError(container()),
        // A claim list that must not be empty has no field to focus, so its Add button does.
        fallback: () =>
          container()
            ?.querySelector('app-schema-array [role="alert"]')
            ?.closest('app-schema-array')
            ?.querySelector<HTMLElement>('button:last-of-type'),
      });
      return;
    }
    const settings = this.settings.getRawValue();
    const request = buildOfferRequest(
      {
        flow: this.flow(),
        credentialIds: this.selected(),
        claims: Object.fromEntries(
          this.chosenForms().map((form) => [
            form.id,
            form.source() === 'form'
              ? { kind: 'form' as const, claims: form.form.value }
              : { kind: 'attributeProvider' as const, providerId: form.configuredProviderId ?? '' },
          ])
        ),
        providers: Object.fromEntries(
          this.chosenForms().map((form) => [form.id, form.provider.value])
        ),
        txCode: settings.txCode,
        txCodeDescription: settings.txCodeDescription,
        authorizationServer: settings.authorizationServer || undefined,
      },
      this.allConfigs()
    );
    this.creation.mutate(request, {
      onSuccess: (response) => {
        this.created.set({ response, txCode: request.tx_code });
        this.notify.success('Offer created.');
      },
      onError: (error) => {
        console.error('Creating the offer failed:', error);
        this.notify.error(getApiErrorMessage(error, 'Failed to create the offer'));
      },
    });
  }

  /** Starts over with an empty offer. */
  protected reset(): void {
    this.created.set(null);
    this.flow.set('pre_authorized_code');
    this.claimForms.set(new Map());
    this.selected.set([]);
    this.pickerInvalid.set(false);
    this.settings.reset({ authorizationServer: '', txCode: '', txCodeDescription: '' });
    this.syncServer('pre_authorized_code', true);
    this.rebuildStepForm();
    this.step.set(0);
  }

  /** Fills the steps in from an earlier offer and opens the last one. */
  private prefill(offer: OfferRequestDto): void {
    const flow = formFlowOf(offer, this.allConfigs());
    this.flow.set(flow);
    this.setSelected(offer.credentialConfigurationIds ?? []);
    this.settings.patchValue({
      txCode: offer.tx_code ?? '',
      txCodeDescription: offer.tx_code_description ?? '',
      authorizationServer: offer.authorization_server ?? '',
    });
    this.syncServer(flow, !offer.authorization_server);
    for (const [id, claims] of Object.entries(offer.credentialClaims ?? {})) {
      const form = this.claimForms().get(id);
      if (!form) continue;
      if (claims.type === 'inline' && flow === 'pre_authorized_code') {
        form.source.set('form');
        form.model.set(
          structuredClone(
            (claimsForForm(form.config, claims.claims) ?? {}) as Record<string, unknown>
          )
        );
      } else if (claims.type === 'attributeProvider') {
        if (flow === 'pre_authorized_code') form.source.set('attributeProvider');
        else form.provider.setValue(claims.attributeProviderId);
      }
    }
    this.rebuildStepForm();
    this.step.set(2);
    this.notify.info('Filled in from the earlier offer.');
  }
}
