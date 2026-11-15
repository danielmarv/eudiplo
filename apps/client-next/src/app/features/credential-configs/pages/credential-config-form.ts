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
import { type AbstractControl, ReactiveFormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import type { CredentialConfigCreate, CredentialConfigUpdate } from '@eudiplo/sdk-core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideArrowDown,
  lucideArrowLeft,
  lucideArrowRight,
  lucideArrowUp,
  lucideBraces,
  lucideChevronDown,
  lucideExternalLink,
  lucideLayoutTemplate,
  lucidePlus,
  lucideTrash2,
  lucideTriangleAlert,
} from '@ng-icons/lucide';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import { HlmCheckboxImports } from '@spartan-ng/helm/checkbox';
import { HlmDialogImports } from '@spartan-ng/helm/dialog';
import { HlmFieldImports } from '@spartan-ng/helm/field';
import { HlmInputImports } from '@spartan-ng/helm/input';
import { HlmNativeSelectImports } from '@spartan-ng/helm/native-select';
import { HlmSkeletonImports } from '@spartan-ng/helm/skeleton';
import { HlmSpinnerImports } from '@spartan-ng/helm/spinner';
import { HlmSwitchImports } from '@spartan-ng/helm/switch';
import { HlmTextareaImports } from '@spartan-ng/helm/textarea';
import { HlmTooltipImports } from '@spartan-ng/helm/tooltip';
import { injectMutation, injectQuery, QueryClient } from '@tanstack/angular-query-experimental';
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
import { duration } from '../../../shared/format/duration';
import { PageHeader } from '../../../shared/pages/page-header';
import { attributeProvidersQuery } from '../../issuance/data/issuance-queries';
import { keyChainsQuery } from '../../keys/data/key-queries';
import { presentationConfigsQuery } from '../../presentation-configs/data/presentation-config-queries';
import { webhookEndpointsQuery } from '../../webhook-endpoints/data/webhook-endpoint-queries';
import { claimSchemaError } from '../data/claim-schema-check';
import {
  type ClaimGroup,
  CLAIM_TYPES,
  createActionGroup,
  createClaimGroup,
  createCredentialConfigForm,
  createDisplayGroup,
  createLabelGroup,
  credentialConfigBody,
  defaultHint,
  type DisplayGroup,
  DOC_TYPE_PRESETS,
  fillCredentialConfigForm,
  hostedVctUrl,
  KEY_ATTESTATION_LEVELS,
  LIFETIME_PRESETS,
  LOCALES,
  REUSE_METHODS,
  statusRequiredBy,
  syncRequiredSettings,
} from '../data/credential-config-form';
import {
  createCredentialConfigMutation,
  credentialConfigQuery,
  credentialConfigsKey,
  updateCredentialConfigMutation,
} from '../data/credential-config-queries';
import { CREDENTIAL_TEMPLATES, type CredentialTemplate } from '../data/templates';

const STEPS = ['Basics', 'Claims', 'Appearance', 'Settings', 'Review'] as const;
type Step = 0 | 1 | 2 | 3 | 4;

/**
 * Adds a credential type (`/credential-config/create`) or changes one (`/credential-config/:id/edit`):
 * its basics (ID, format, vct or docType), claims, how wallets show it, the settings of issuance
 * and the integrations. A new one is set up step by step, with a review at the end; any step can
 * be opened at once with "Show all steps". It can start from a template, and the whole
 * configuration can be edited as JSON.
 */
@Component({
  selector: 'app-credential-config-form',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    RouterLink,
    NgIcon,
    HlmButtonImports,
    HlmCheckboxImports,
    HlmDialogImports,
    HlmFieldImports,
    HlmInputImports,
    HlmNativeSelectImports,
    HlmSkeletonImports,
    HlmSpinnerImports,
    HlmSwitchImports,
    HlmTextareaImports,
    HlmTooltipImports,
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
      lucideLayoutTemplate,
      lucidePlus,
      lucideTrash2,
      lucideTriangleAlert,
    }),
  ],
  templateUrl: './credential-config-form.html',
})
export class CredentialConfigForm {
  /** The credential type to edit, from the route; none to add one. */
  readonly id = input<string>();

  private readonly instance = inject(SessionService).getBaseUrl();
  private readonly caller = inject(CallerService).loadedCaller;
  private readonly tenant = computed(() => this.caller()?.tenantId);
  private readonly router = inject(Router);
  private readonly notify = inject(NotifyService);
  private readonly queryClient = inject(QueryClient);
  private readonly injector = inject(Injector);
  private readonly destroyRef = inject(DestroyRef);
  private readonly formElement = viewChild<ElementRef<HTMLFormElement>>('formElement');

  protected readonly editing = computed(() => !!this.id());
  protected readonly stored = injectQuery(() => ({
    ...credentialConfigQuery(this.instance, this.tenant(), this.id() ?? ''),
    enabled: !!this.instance && !!this.id(),
  }));
  private readonly ownership = injectQuery(() =>
    configOwnershipQuery(this.instance, this.tenant(), 'CredentialConfig', this.editing())
  );
  protected readonly owner = computed(() =>
    this.ownership.data()?.find((resource) => resource.resourceId === this.id())
  );
  protected readonly locked = computed(() => {
    const id = this.id();
    const managed = id ? fileManaged(this.ownership.data()).get(id) : undefined;
    return managed ? lockReason(managed) : '';
  });

  protected readonly keyChains = injectQuery(() => keyChainsQuery(this.instance, this.tenant()));
  protected readonly signingKeys = computed(() =>
    (this.keyChains.data() ?? []).filter((chain) => chain.usageType === 'attestation')
  );
  protected readonly presentationConfigs = injectQuery(() =>
    presentationConfigsQuery(this.instance, this.tenant())
  );
  protected readonly attributeProviders = injectQuery(() =>
    attributeProvidersQuery(this.instance, this.tenant())
  );
  protected readonly webhookEndpoints = injectQuery(() =>
    webhookEndpointsQuery(this.instance, this.tenant())
  );
  private readonly frontendConfig = injectQuery(() => frontendConfigQuery(this.instance));

  private readonly create = injectMutation(() => createCredentialConfigMutation());
  private readonly update = injectMutation(() => updateCredentialConfigMutation());
  protected readonly saving = computed(() => this.create.isPending() || this.update.isPending());

  protected readonly form = createCredentialConfigForm();
  /** The form's value, as a signal for what the page shows besides the fields. */
  protected readonly value = toSignal(
    merge(this.form.valueChanges, this.form.statusChanges).pipe(
      startWith(null),
      map(() => this.form.getRawValue())
    ),
    { requireSync: true }
  );
  protected readonly mdoc = computed(() => this.value().format === 'mso_mdoc');

  // ---- Steps ----

  protected readonly steps = STEPS;
  /** A new credential type is set up step by step; an existing one shows every step at once. */
  protected readonly guided = signal(true);
  protected readonly step = signal<Step>(0);
  protected readonly furthest = signal<Step>(0);
  protected readonly stepError = signal('');
  protected readonly attempted = signal(false);
  /** The claim rows and display entries that are open. */
  protected readonly openClaims = signal<ReadonlySet<AbstractControl>>(new Set());
  protected readonly openDisplays = signal<ReadonlySet<AbstractControl>>(new Set());

  protected readonly templates = CREDENTIAL_TEMPLATES;
  protected readonly claimTypes = CLAIM_TYPES;
  protected readonly locales = LOCALES;
  protected readonly lifetimePresets = LIFETIME_PRESETS;
  protected readonly docTypePresets = DOC_TYPE_PRESETS;
  protected readonly keyAttestationLevels = KEY_ATTESTATION_LEVELS;
  protected readonly reuseMethods = REUSE_METHODS;
  protected readonly defaultHint = defaultHint;
  protected readonly duration = duration;

  /** The vct EUDIPLO hosts the type metadata under, from the backend's public URL. */
  protected readonly hostedVct = computed(() =>
    hostedVctUrl(
      this.frontendConfig.data()?.publicUrl ?? '<PUBLIC_URL>',
      this.tenant() ?? '<tenant>',
      this.value().id || '<credential-id>'
    )
  );
  protected readonly customLifetime = signal(false);
  protected readonly statusRequiredBy = computed(() => {
    this.value();
    return statusRequiredBy(this.form);
  });
  /** The first listed locale no display entry uses yet; adding one needs it. */
  protected readonly unusedLocale = computed(() => {
    const used = new Set(this.value().displays.map((display) => display.locale.toLowerCase()));
    return LOCALES.find((locale) => !used.has(locale.value.toLowerCase()))?.value;
  });

  /** Invalid controls per step, for the badges of the step list. */
  protected readonly errorsPerStep = computed(() => {
    this.value();
    return STEPS.map((_, index) => countInvalid(this.stepControls(index as Step)));
  });

  // ---- JSON view ----

  protected readonly jsonOpen = signal(false);
  protected readonly jsonText = signal('');
  protected readonly jsonError = signal('');
  protected readonly templatesOpen = signal(false);

  constructor() {
    effect(() => {
      if (this.editing()) untracked(() => this.guided.set(false));
    });
    let filled = false;
    effect(() => {
      const config = this.stored.data();
      if (!config || filled) return;
      filled = true;
      untracked(() => {
        fillCredentialConfigForm(this.form, config as unknown as CredentialConfigCreate);
        this.form.controls.id.disable();
        this.customLifetime.set(
          !LIFETIME_PRESETS.some((preset) => preset.value === config.lifeTime)
        );
        this.openInvalidRows();
      });
    });
    effect(() => {
      const disabled = !!this.locked();
      untracked(() => {
        if (disabled && this.form.enabled) this.form.disable({ emitEvent: false });
      });
    });
    const { activeCredentials, revokeWithWalletUnit, format, vctMode, displays } =
      this.form.controls;
    merge(activeCredentials.valueChanges, revokeWithWalletUnit.valueChanges).subscribe(() =>
      syncRequiredSettings(this.form)
    );
    merge(format.valueChanges, vctMode.valueChanges).subscribe(() => {
      const { vctString, vct, docType } = this.form.controls;
      for (const control of [vctString, vct, docType])
        control.updateValueAndValidity({ emitEvent: false });
      this.form.updateValueAndValidity();
    });
    // A locale is checked against the other entries, which do not revalidate on their own.
    displays.valueChanges.subscribe(() => {
      for (const display of displays.controls) {
        display.controls.locale.updateValueAndValidity({ emitEvent: false });
      }
    });
  }

  // ---- Steps ----

  private stepControls(step: Step): AbstractControl[] {
    const c = this.form.controls;
    switch (step) {
      case 0:
        return [c.id, c.description, c.format, c.vctString, c.vct, c.docType];
      case 1:
        return [c.fields];
      case 2:
        return [c.displays];
      case 3:
        return [
          c.keyChainId,
          c.scope,
          c.lifeTime,
          c.proofTypes,
          c.reuseBatchSize,
          c.reuseTriggerUnused,
          c.reuseTriggerLifetime,
          c.embeddedDisclosurePolicy,
          c.actions,
        ];
      default:
        return [];
    }
  }

  /** Whether `step` is valid; shows its errors and opens it when it is not. */
  private validateStep(step: Step): boolean {
    const controls = this.stepControls(step);
    if (!controls.some((control) => control.invalid)) return true;
    controls.forEach((control) => control.markAllAsTouched());
    this.attempted.set(true);
    this.openInvalidRows();
    this.stepError.set(`Check the highlighted fields in ${STEPS[step]}.`);
    this.step.set(step);
    this.focusFirstInvalid();
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
    const next = Math.min(4, this.step() + 1) as Step;
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

  private openInvalidRows(): void {
    this.openClaims.update(
      (open) =>
        new Set([...open, ...this.form.controls.fields.controls.filter((row) => row.invalid)])
    );
    this.openDisplays.update(
      (open) =>
        new Set([...open, ...this.form.controls.displays.controls.filter((row) => row.invalid)])
    );
  }

  private focusFirstInvalid(): void {
    afterNextRender(
      () =>
        this.formElement()
          ?.nativeElement.querySelector<HTMLElement>(
            'input.ng-invalid, textarea.ng-invalid, select.ng-invalid'
          )
          ?.focus(),
      { injector: this.injector }
    );
  }

  protected toggleOpen(which: 'claims' | 'displays', row: AbstractControl): void {
    const target = which === 'claims' ? this.openClaims : this.openDisplays;
    target.update((open) => {
      const next = new Set(open);
      if (next.has(row)) next.delete(row);
      else next.add(row);
      return next;
    });
  }

  // ---- Rows ----

  protected get claims() {
    return this.form.controls.fields;
  }

  protected get displays() {
    return this.form.controls.displays;
  }

  protected get actions() {
    return this.form.controls.actions;
  }

  protected addClaim(): void {
    const row = createClaimGroup();
    this.claims.push(row);
    this.openClaims.update((open) => new Set([...open, row]));
  }

  protected removeClaim(index: number): void {
    this.claims.removeAt(index);
  }

  protected addLabel(claim: ClaimGroup): void {
    claim.controls.display.push(createLabelGroup());
  }

  protected removeLabel(claim: ClaimGroup, index: number): void {
    claim.controls.display.removeAt(index);
  }

  protected addDisplay(): void {
    const locale = this.unusedLocale();
    if (!locale) return;
    const group = createDisplayGroup({ locale });
    this.displays.push(group);
    this.openDisplays.update((open) => new Set([...open, group]));
  }

  protected removeDisplay(index: number): void {
    if (this.displays.length > 1) this.displays.removeAt(index);
  }

  /** The listed locales, plus a stored one the list lacks; those other entries use are disabled. */
  protected localeOptions(
    display: DisplayGroup
  ): { value: string; label: string; disabled: boolean }[] {
    const locale = display.controls.locale.value;
    const usedElsewhere = new Set(
      this.displays.controls
        .filter((other) => other !== display)
        .map((other) => other.controls.locale.value.toLowerCase())
    );
    const options =
      LOCALES.some((option) => option.value === locale) || !locale
        ? LOCALES
        : [...LOCALES, { value: locale, label: locale }];
    return options.map((option) => ({
      ...option,
      disabled: option.value !== locale && usedElsewhere.has(option.value.toLowerCase()),
    }));
  }

  protected swatch(control: AbstractControl): string | null {
    const color = typeof control.value === 'string' ? control.value.trim() : '';
    return color && control.valid ? color : null;
  }

  protected addAction(type: 'openid4vp_presentation' | 'redirect_to_web'): void {
    this.actions.push(createActionGroup({ type }));
  }

  protected removeAction(index: number): void {
    this.actions.removeAt(index);
  }

  protected moveAction(index: number, by: -1 | 1): void {
    const target = index + by;
    if (target < 0 || target >= this.actions.length) return;
    const action = this.actions.at(index);
    this.actions.removeAt(index, { emitEvent: false });
    this.actions.insert(target, action);
  }

  /** Changes the kind of an authorization step, keeping its label. */
  protected setActionType(index: number, type: string): void {
    const label = this.actions.at(index).controls.label.value;
    this.actions.setControl(
      index,
      createActionGroup({ type: type as 'openid4vp_presentation' | 'redirect_to_web', label })
    );
  }

  protected setLifetime(value: string): void {
    if (value === 'custom') {
      this.customLifetime.set(true);
      return;
    }
    this.customLifetime.set(false);
    this.form.controls.lifeTime.setValue(Number(value));
    this.form.controls.lifeTime.markAsDirty();
  }

  protected toggleList(
    control: 'proofTypes' | 'keyStorage' | 'userAuthentication' | 'reuseMethods',
    value: string,
    checked: boolean
  ): void {
    const field = this.form.controls[control] as AbstractControl<string[]>;
    const rest = field.value.filter((item) => item !== value);
    field.markAsDirty();
    field.markAsTouched();
    field.setValue(checked ? [...rest, value] : rest);
  }

  protected claimSummary(row: ClaimGroup): string {
    const value = row.getRawValue();
    return [
      value.type,
      !this.mdoc() && value.disclosable ? 'disclosable' : '',
      value.mandatory ? 'mandatory' : '',
      value.constraints.trim() ? 'constraints' : '',
    ]
      .filter(Boolean)
      .join(' · ');
  }

  /** The settings at a glance, for the Settings step and the review. */
  protected readonly settingsSummary = computed(() => {
    const value = this.value();
    return [
      `Lifetime ${duration(value.lifeTime || 0)}`,
      `signing key ${value.keyChainId || 'the default'}`,
      `key binding ${value.keyBinding ? 'on' : 'off'}`,
      `revocable ${value.statusManagement ? 'yes' : 'no'}`,
      `proofs ${value.proofTypes.join(', ') || 'none'}`,
      this.mdoc() ? 'trust: mdoc certificate chain' : `trust: ${value.sdJwtTrustFormat}`,
    ].join(' · ');
  });

  // ---- Templates and JSON ----

  protected useTemplate(template: CredentialTemplate): void {
    fillCredentialConfigForm(this.form, structuredClone(template.config));
    this.templatesOpen.set(false);
    this.notify.success(`${template.name} loaded. Change what you need, then save.`);
  }

  protected openJson(): void {
    try {
      this.jsonText.set(JSON.stringify(credentialConfigBody(this.form), null, 2));
    } catch {
      for (let step = 0; step < 4; step++) if (!this.validateStep(step as Step)) break;
      this.notify.error('Fix the highlighted fields before you open the JSON.');
      return;
    }
    this.jsonError.set('');
    this.jsonOpen.set(true);
  }

  protected applyJson(): void {
    let config: CredentialConfigCreate;
    try {
      config = JSON.parse(this.jsonText()) as CredentialConfigCreate;
    } catch (error) {
      this.jsonError.set(`The text is no valid JSON: ${(error as Error).message}`);
      return;
    }
    if (!config || typeof config !== 'object' || !config.config) {
      this.jsonError.set('A credential type needs at least "id" and "config".');
      return;
    }
    const id = this.form.controls.id.value;
    fillCredentialConfigForm(this.form, config);
    if (this.editing()) this.form.controls.id.setValue(id);
    this.jsonOpen.set(false);
    this.openInvalidRows();
  }

  // ---- Save ----

  protected submit(): void {
    if (this.guided() && this.step() < 4) {
      this.next();
      return;
    }
    this.save();
  }

  protected save(): void {
    if (this.saving() || this.locked()) return;
    this.attempted.set(true);
    this.stepError.set('');
    for (let step = 0; step < 4; step++) if (!this.validateStep(step as Step)) return;
    let body: CredentialConfigCreate;
    try {
      body = credentialConfigBody(this.form);
    } catch {
      this.notify.error('A JSON field or a claim default does not parse.');
      return;
    }
    const unusable = claimSchemaError(body.fields ?? []);
    if (unusable) {
      this.step.set(1);
      this.notify.error(`Issuance could not use the claim constraints: ${unusable}`);
      return;
    }
    const handlers = {
      onSuccess: () => {
        this.notify.success(`${body.id} ${this.editing() ? 'saved' : 'added'}.`);
        void this.queryClient.invalidateQueries({
          queryKey: credentialConfigsKey(this.instance, this.tenant()),
        });
        if (!this.destroyRef.destroyed) void this.router.navigate(['/credential-config', body.id]);
      },
      onError: (error: unknown) =>
        this.notify.error(
          getApiErrorMessage(error, 'Failed to save the credential type', { allIssues: true })
        ),
    };
    const id = this.id();
    if (id) {
      this.update.mutate({ id, body: body as unknown as CredentialConfigUpdate }, handlers);
    } else {
      this.create.mutate(body, handlers);
    }
  }

  protected errorMessage(error: unknown): string {
    return getApiErrorMessage(error, 'Failed to load the credential type');
  }
}

/** The number of invalid form controls under `controls`. */
function countInvalid(controls: readonly AbstractControl[]): number {
  let count = 0;
  const visit = (control: AbstractControl): void => {
    const children = (control as { controls?: Record<string, AbstractControl> | AbstractControl[] })
      .controls;
    if (children) {
      Object.values(children).forEach(visit);
    } else if (control.invalid) {
      count++;
    }
  };
  controls.forEach(visit);
  return count;
}
