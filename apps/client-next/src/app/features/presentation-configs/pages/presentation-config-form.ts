import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  Injector,
  input,
  signal,
  type ElementRef,
  untracked,
  viewChild,
} from '@angular/core';
import { JsonPipe } from '@angular/common';
import { ReactiveFormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import {
  type PresentationConfig,
  type PresentationConfigCreateDto,
  type PresentationConfigUpdateDto,
  type SchemaMetadataResponseDto,
} from '@eudiplo/sdk-core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideArrowLeft,
  lucideBraces,
  lucideCheck,
  lucideCode,
  lucideExternalLink,
  lucidePlus,
  lucideRefreshCw,
  lucideShieldCheck,
  lucideTriangleAlert,
  lucideUpload,
} from '@ng-icons/lucide';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import { HlmDialogImports } from '@spartan-ng/helm/dialog';
import { HlmInputImports } from '@spartan-ng/helm/input';
import { HlmNativeSelectImports } from '@spartan-ng/helm/native-select';
import { HlmSkeletonImports } from '@spartan-ng/helm/skeleton';
import { HlmSpinnerImports } from '@spartan-ng/helm/spinner';
import { HlmTextareaImports } from '@spartan-ng/helm/textarea';
import { HlmTooltipImports } from '@spartan-ng/helm/tooltip';
import { injectMutation, injectQuery, QueryClient } from '@tanstack/angular-query-experimental';
import { CallerService } from '../../../core/auth/caller.service';
import { SessionService } from '../../../core/auth/session.service';
import { getApiErrorMessage, hasHttpStatus } from '../../../core/errors/error-message';
import { NotifyService } from '../../../core/notify/notify.service';
import {
  configOwnershipQuery,
  fileManaged,
  lockReason,
} from '../../../shared/config-ownership/config-ownership';
import { OwnershipNotice } from '../../../shared/config-ownership/ownership-notice';
import { type FormSection, showFieldsToFix } from '../../../shared/forms/field-to-fix';
import { PageHeader } from '../../../shared/pages/page-header';
import { DcqlEditor } from '../components/dcql-editor';
import {
  DEFAULT_LIFETIME,
  configBody,
  createConfigForm,
  fillConfigForm,
  purposeGroup,
  type RegistrationMode,
} from '../data/presentation-config-form';
import { dcqlFromIssuer, dcqlFromSchema } from '../data/presentation-config-import';
import {
  STATUS_CHECK_MODES,
  PURPOSE_LANGUAGES,
  registrationCertStatus,
  registrationCertSourceLabel,
  statusCheckModeOf,
} from '../data/presentation-config-display';
import {
  createPresentationConfigMutation,
  defaultAccessKeyChainQuery,
  presentationConfigQuery,
  presentationConfigsKey,
  presentationKeyChainsQuery,
  reissueRegistrationCertMutation,
  resolveIssuerMetadataMutation,
  resolveSchemaMetadataJwtMutation,
  resolveSchemaMetadataMutation,
  schemaMetadataCatalogQuery,
  updatePresentationConfigMutation,
} from '../data/presentation-config-queries';
import { draftOf, draftQuery, type DcqlDraft } from '../data/dcql-draft';
import { webhookEndpointsQuery } from '../../webhook-endpoints/data/webhook-endpoint-queries';
import { registrarConfigQuery } from '../../registrar/data/registrar-queries';

const TEMPLATES: { name: string; description: string; config: PresentationConfigCreateDto }[] = [
  {
    name: 'PID (Personal Identity Document)',
    description: 'Request the given name from a German PID',
    config: {
      id: 'pid',
      description: 'Request a given name from a German PID',
      dcql_query: {
        credentials: [
          {
            id: 'pid',
            format: 'dc+sd-jwt',
            meta: { vct_values: ['urn:eudi:pid:de:1'] },
            claims: [{ path: ['given_name'] }],
          },
        ],
      },
    },
  },
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function urlIsHttp(value: string): boolean {
  try {
    return ['http:', 'https:'].includes(new URL(value).protocol);
  } catch {
    return false;
  }
}

/**
 * Creates, edits or copies a presentation configuration. The DCQL editor keeps unsupported query
 * features in JSON, while the other request settings remain in one reactive form.
 */
@Component({
  selector: 'app-presentation-config-form',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    JsonPipe,
    ReactiveFormsModule,
    RouterLink,
    NgIcon,
    HlmButtonImports,
    HlmDialogImports,
    HlmInputImports,
    HlmNativeSelectImports,
    HlmSkeletonImports,
    HlmSpinnerImports,
    HlmTextareaImports,
    HlmTooltipImports,
    DcqlEditor,
    OwnershipNotice,
    PageHeader,
  ],
  providers: [
    provideIcons({
      lucideArrowLeft,
      lucideBraces,
      lucideCheck,
      lucideCode,
      lucideExternalLink,
      lucidePlus,
      lucideRefreshCw,
      lucideShieldCheck,
      lucideTriangleAlert,
      lucideUpload,
    }),
  ],
  templateUrl: './presentation-config-form.html',
})
export class PresentationConfigForm {
  readonly id = input<string>();
  readonly copy = input(false);

  private readonly instance = inject(SessionService).getBaseUrl();
  private readonly caller = inject(CallerService).loadedCaller;
  private readonly tenant = computed(() => this.caller()?.tenantId);
  private readonly router = inject(Router);
  private readonly queryClient = inject(QueryClient);
  private readonly notify = inject(NotifyService);
  private readonly injector = inject(Injector);
  private readonly formElement = viewChild<ElementRef<HTMLFormElement>>('formElement');

  protected readonly form = createConfigForm();
  protected readonly draft = signal<DcqlDraft>(draftOf(undefined));
  protected readonly showQueryErrors = signal(false);
  protected readonly guidedOverride = signal<boolean | null>(null);
  protected readonly guided = computed(() => this.guidedOverride() ?? !this.id());
  protected readonly activeStep = signal(0);
  protected readonly furthestStep = signal(0);
  protected readonly jsonOpen = signal(false);
  protected readonly jsonReadonly = signal(false);
  protected readonly json = signal('');
  protected readonly jsonError = signal('');
  protected readonly importKind = signal<'issuer' | 'schema'>('issuer');
  protected readonly issuerUrl = signal('');
  protected readonly schemaUrl = signal('');
  protected readonly importError = signal('');
  protected readonly importBusy = signal(false);
  protected readonly saving = signal(false);
  protected readonly reissuing = signal(false);
  protected readonly formError = signal('');
  protected readonly registrationCache = signal<PresentationConfig['registrationCertCache']>(null);

  protected readonly editing = computed(() => !!this.id() && !this.copy());
  protected readonly title = computed(() =>
    this.copy()
      ? 'Copy presentation configuration'
      : this.editing()
        ? 'Edit presentation configuration'
        : 'Create presentation configuration'
  );
  protected readonly config = injectQuery(() => ({
    ...presentationConfigQuery(this.instance, this.tenant(), this.id() ?? ''),
    staleTime: 0,
  }));
  private readonly ownership = injectQuery(() =>
    configOwnershipQuery(this.instance, this.tenant(), 'PresentationConfig', this.editing())
  );
  protected readonly owner = computed(() =>
    this.ownership.data()?.find((resource) => resource.resourceId === this.id())
  );
  protected readonly locked = computed(() => {
    const managed =
      this.id() && this.editing() ? fileManaged(this.ownership.data()).get(this.id()!) : undefined;
    return managed ? lockReason(managed) : '';
  });
  protected readonly keyChains = injectQuery(() =>
    presentationKeyChainsQuery(this.instance, this.tenant())
  );
  protected readonly defaultAccess = injectQuery(() =>
    defaultAccessKeyChainQuery(this.instance, this.tenant())
  );
  protected readonly webhooks = injectQuery(() =>
    webhookEndpointsQuery(this.instance, this.tenant())
  );
  protected readonly registrar = injectQuery(() =>
    registrarConfigQuery(this.instance, this.tenant())
  );
  protected readonly catalog = injectQuery(() =>
    schemaMetadataCatalogQuery(this.instance, this.tenant())
  );

  private readonly createMutation = injectMutation(() => createPresentationConfigMutation());
  private readonly updateMutation = injectMutation(() => updatePresentationConfigMutation());
  private readonly reissueMutation = injectMutation(() => reissueRegistrationCertMutation());
  private readonly resolveIssuer = injectMutation(() => resolveIssuerMetadataMutation());
  private readonly resolveSchema = injectMutation(() => resolveSchemaMetadataMutation());
  private readonly resolveSchemaJwt = injectMutation(() => resolveSchemaMetadataJwtMutation());

  protected readonly modes = STATUS_CHECK_MODES;
  protected readonly languages = PURPOSE_LANGUAGES;
  protected readonly templates = TEMPLATES;
  protected readonly registrationStatus = computed(() => {
    const spec = this.registrationCertificate();
    return registrationCertStatus({
      registration_cert: spec,
      registrationCertCache: this.registrationCache(),
    });
  });
  protected readonly registrationStatusLabel = computed(() =>
    this.registrationStatus().replace('_', ' ')
  );
  protected readonly stepDescriptions = [
    'Name your reusable request',
    'Choose credentials and claims',
    'Review defaults and optional settings',
    'Check the configuration before saving',
  ];
  protected readonly accessSetupMessage = computed(() => {
    const chains = this.keyChains.data();
    if (!chains) return '';
    const selected = this.form.controls.accessKeyChainId.value;
    const defaultId = this.defaultAccess.data()?.defaultAccessKeyChainId;
    const effectiveId = selected || (defaultId ? this.defaultAccess.data()?.keyChainId : undefined);
    if (defaultId && !selected && !chains.some((chain) => chain.id === effectiveId)) {
      return 'The tenant default access key chain is missing. Choose another key chain or update Key Management.';
    }
    const candidates = effectiveId ? chains.filter((chain) => chain.id === effectiveId) : chains;
    return candidates.some((chain) => !!chain.activeCertificate?.pem)
      ? ''
      : 'An access key chain with an active certificate is needed to create presentation requests.';
  });
  protected readonly configError = computed(() =>
    this.config.isError() ? this.errorMessage(this.config.error()) : ''
  );
  protected readonly sourceRequired = computed(() => !!this.id());

  constructor() {
    effect(() => {
      const current = this.config.data();
      if (!current || !this.id()) return;
      untracked(() => {
        if (this.form.dirty) return;
        fillConfigForm(this.form, current, this.copy());
        this.draft.set(draftOf(current.dcql_query));
        this.registrationCache.set(current.registrationCertCache ?? null);
        this.form.markAsPristine();
      });
    });

    effect(() => {
      const defaults = this.registrar.data()?.registrationCertificateDefaults;
      if (!defaults || this.editing() || this.copy() || this.form.dirty) return;
      untracked(() => {
        const privacy = defaults.privacy_policy?.trim();
        const support = defaults.support_uri?.trim();
        if (privacy && !this.form.controls.privacyPolicy.value.trim()) {
          this.form.controls.privacyPolicy.setValue(privacy);
        }
        if (support && !this.form.controls.supportUri.value.trim()) {
          this.form.controls.supportUri.setValue(support);
        }
      });
    });
  }

  protected openJson(): void {
    const query = draftQuery(this.draft());
    if (!query.query) {
      this.showQueryErrors.set(true);
      this.notify.error(query.error ?? 'Fix the DCQL query before opening the full JSON editor.');
      return;
    }
    this.json.set(JSON.stringify(configBody(this.form, query.query, this.editing()), null, 2));
    this.jsonError.set('');
    this.jsonReadonly.set(false);
    this.jsonOpen.set(true);
  }

  protected previewTemplate(template: (typeof TEMPLATES)[number]): void {
    this.json.set(JSON.stringify(template.config, null, 2));
    this.jsonError.set('');
    this.jsonReadonly.set(true);
    this.jsonOpen.set(true);
  }

  protected applyJson(): void {
    try {
      const value: unknown = JSON.parse(this.json());
      if (!isRecord(value)) throw new Error('The configuration must be a JSON object.');
      if (typeof value['id'] !== 'string' || !isRecord(value['dcql_query'])) {
        throw new Error('The configuration needs a string "id" and a DCQL query object.');
      }
      fillConfigForm(this.form, { ...value, ...(this.editing() ? { id: this.id() } : {}) }, false);
      this.draft.set(draftOf(value['dcql_query']));
      this.jsonOpen.set(false);
      this.jsonReadonly.set(false);
      this.formError.set('');
    } catch (error) {
      this.jsonError.set(
        error instanceof SyntaxError
          ? `This is not valid JSON: ${error.message}`
          : error instanceof Error
            ? error.message
            : String(error)
      );
    }
  }

  protected loadTemplate(template: (typeof TEMPLATES)[number]): void {
    const currentId = this.form.controls.id.value;
    const currentDescription = this.form.controls.description.value;
    fillConfigForm(
      this.form,
      {
        ...structuredClone(template.config),
        id: currentId || template.config.id,
        description: currentDescription || template.config.description,
      },
      false
    );
    this.draft.set(draftOf(template.config.dcql_query));
    this.notify.success(`${template.name} template loaded.`);
  }

  protected chooseImport(kind: 'issuer' | 'schema'): void {
    this.importKind.set(kind);
    this.importError.set('');
  }

  protected async importIssuer(): Promise<void> {
    const issuerUrl = this.issuerUrl().trim();
    if (!urlIsHttp(issuerUrl)) {
      this.importError.set('Enter an http or https credential issuer URL.');
      return;
    }
    if (!this.confirmImportReplacement()) return;
    this.importBusy.set(true);
    this.importError.set('');
    try {
      const metadata = await this.resolveIssuer.mutateAsync({ issuerUrl });
      this.draft.set(draftOf(dcqlFromIssuer(metadata)));
      this.notify.success('Credential query imported from issuer metadata.');
    } catch (error) {
      this.importError.set(getApiErrorMessage(error, 'Failed to resolve issuer metadata.'));
    } finally {
      this.importBusy.set(false);
    }
  }

  protected async importSchemaUrl(): Promise<void> {
    const schemaMetadataUrl = this.schemaUrl().trim();
    if (!urlIsHttp(schemaMetadataUrl)) {
      this.importError.set('Enter an http or https schema metadata URL.');
      return;
    }
    if (!this.confirmImportReplacement()) return;
    this.importBusy.set(true);
    this.importError.set('');
    try {
      const resolved = await this.resolveSchema.mutateAsync({ schemaMetadataUrl });
      this.applySchema(resolved);
    } catch (error) {
      this.importError.set(getApiErrorMessage(error, 'Failed to resolve schema metadata.'));
    } finally {
      this.importBusy.set(false);
    }
  }

  protected async importCatalogEntry(entry: SchemaMetadataResponseDto): Promise<void> {
    if (!this.confirmImportReplacement()) return;
    this.importBusy.set(true);
    this.importError.set('');
    try {
      const resolved = await this.resolveSchemaJwt.mutateAsync({ signedJwt: entry.signedJwt });
      this.applySchema(resolved);
    } catch (error) {
      this.importError.set(getApiErrorMessage(error, 'Failed to resolve the selected schema.'));
    } finally {
      this.importBusy.set(false);
    }
  }

  private applySchema(resolved: Awaited<ReturnType<typeof this.resolveSchema.mutateAsync>>): void {
    try {
      const imported = dcqlFromSchema(resolved);
      this.draft.set(draftOf(imported.query));
      if (!this.form.controls.id.value.trim()) this.form.controls.id.setValue(imported.id);
      if (!this.form.controls.description.value.trim()) {
        this.form.controls.description.setValue(imported.description);
      }
      this.notify.success('DCQL query imported from schema metadata.');
    } catch (error) {
      this.importError.set(error instanceof Error ? error.message : String(error));
    }
  }

  private confirmImportReplacement(): boolean {
    const draft = this.draft();
    const hasContent =
      draft.mode === 'json'
        ? !!draft.json.trim()
        : draft.simple.credentials.length > 1 ||
          draft.simple.credentials.some(
            (credential, index) =>
              credential.id !== (index ? `credential_${index + 1}` : 'credential') ||
              credential.format !== 'dc+sd-jwt' ||
              !!credential.type.trim() ||
              credential.claims.length > 0 ||
              !!credential.trustedAuthorities?.length
          ) ||
          !!draft.simple.credentialSets?.length;
    return (
      !hasContent ||
      globalThis.confirm('Importing this query will replace the current DCQL query. Continue?')
    );
  }

  protected addPurpose(): void {
    this.form.controls.purposes.push(purposeGroup());
  }

  protected removePurpose(index: number): void {
    this.form.controls.purposes.removeAt(index);
  }

  protected async reissueRegistrationCertificate(): Promise<void> {
    const id = this.id();
    if (!id || !this.editing() || this.reissuing()) return;
    this.reissuing.set(true);
    try {
      const updated = await this.reissueMutation.mutateAsync(id);
      this.registrationCache.set(updated.registrationCertCache ?? null);
      this.queryClient.setQueryData(
        [...presentationConfigsKey(this.instance, this.tenant()), id],
        updated
      );
      await this.queryClient.invalidateQueries({
        queryKey: presentationConfigsKey(this.instance, this.tenant()),
        exact: true,
      });
      this.notify.success('Registration certificate reissued.');
    } catch (error) {
      this.notify.error(
        getApiErrorMessage(error, 'Failed to reissue the registration certificate')
      );
    } finally {
      this.reissuing.set(false);
    }
  }

  protected toggleGuided(): void {
    this.guidedOverride.set(!this.guided());
  }

  protected nextStep(): void {
    const step = this.activeStep();
    if (step >= 3 || !this.validateStep(step)) return;
    this.furthestStep.update((furthest) => Math.max(furthest, step + 1));
    this.activeStep.set(step + 1);
  }

  protected previousStep(): void {
    if (this.saving()) return;
    this.activeStep.update((step) => Math.max(0, step - 1));
  }

  protected submit(): void {
    if (this.saving() || this.locked()) return;
    if (this.guided() && this.activeStep() < 3) {
      this.nextStep();
      return;
    }
    for (let step = 0; step < 3; step++) {
      if (!this.validateStep(step)) {
        this.activeStep.set(step);
        return;
      }
    }
    const query = draftQuery(this.draft());
    this.showQueryErrors.set(true);
    if (!query.query) {
      this.activeStep.set(1);
      this.formError.set(query.error ?? 'Check the DCQL query before saving.');
      this.notify.error(query.error ?? 'Fix the DCQL query before saving.');
      return;
    }
    const referenceError = this.integrationReferenceError(query.query);
    if (this.form.invalid || referenceError) {
      this.activeStep.set(2);
      this.form.markAllAsTouched();
      this.formError.set(
        referenceError ?? 'Check the highlighted settings before saving this configuration.'
      );
      const controls = this.form.controls;
      const sections: FormSection[] = [
        { name: 'Configuration', controls: [controls.id, controls.description] },
        {
          name: 'Request settings',
          controls: [controls.lifeTime, controls.redirectUri, controls.allowedOrigins],
        },
        {
          name: 'Registration certificate',
          controls: [controls.registrationJwt, controls.registrationId, controls.purposes],
        },
        { name: 'Integrations', controls: [controls.transactionData, controls.attached] },
      ];
      showFieldsToFix(this.form, {
        notify: this.notify,
        injector: this.injector,
        container: () => this.formElement()?.nativeElement,
        sections,
      });
      return;
    }
    this.formError.set('');
    const body = configBody(this.form, query.query, this.editing());
    this.saving.set(true);
    if (this.editing()) this.save(this.id()!, body as PresentationConfigUpdateDto);
    else this.create(body as PresentationConfigCreateDto);
  }

  private validateStep(step: number): boolean {
    if (step === 0) {
      this.form.controls.id.markAsTouched();
      this.form.controls.description.markAsTouched();
      if (this.form.controls.id.invalid || this.form.controls.description.invalid) {
        this.formError.set('Enter an ID and description for this presentation configuration.');
        return false;
      }
    }
    if (step === 1) {
      this.showQueryErrors.set(true);
      const query = draftQuery(this.draft());
      if (!query.query) {
        this.formError.set(query.error ?? 'Check the DCQL query.');
        return false;
      }
    }
    if (step === 2) {
      const controls = Object.entries(this.form.controls)
        .filter(([name]) => !['id', 'description'].includes(name))
        .map(([, control]) => control);
      controls.forEach((control) => control.markAllAsTouched());
      const query = draftQuery(this.draft());
      const referenceError = this.integrationReferenceError(query.query);
      if (referenceError) {
        this.formError.set(referenceError);
        return false;
      }
      if (controls.some((control) => control.invalid)) {
        this.formError.set('Check the highlighted settings.');
        return false;
      }
    }
    this.formError.set('');
    return true;
  }

  private create(body: PresentationConfigCreateDto): void {
    this.createMutation.mutate(body, {
      onSuccess: async (created) => {
        await this.finishSave(created, 'created');
      },
      onError: (error) => {
        this.saving.set(false);
        this.notify.error(
          getApiErrorMessage(error, 'Failed to create the presentation configuration')
        );
      },
    });
  }

  private save(id: string, body: PresentationConfigUpdateDto): void {
    this.updateMutation.mutate(
      { id, body },
      {
        onSuccess: async (updated) => {
          await this.finishSave(updated, 'saved');
        },
        onError: (error) => {
          this.saving.set(false);
          this.notify.error(
            getApiErrorMessage(error, 'Failed to save the presentation configuration')
          );
        },
      }
    );
  }

  private async finishSave(config: PresentationConfig, action: 'created' | 'saved'): Promise<void> {
    const listKey = presentationConfigsKey(this.instance, this.tenant());
    this.queryClient.setQueryData([...listKey, config.id], config);
    await this.queryClient.invalidateQueries({ queryKey: listKey, exact: true });
    this.form.markAsPristine();
    this.saving.set(false);
    this.notify.success(`Presentation configuration ${config.id} ${action}.`);
    await this.router.navigate(['/presentation-config', config.id]);
  }

  private registrationCertificate(): PresentationConfig['registration_cert'] {
    const value = this.form.getRawValue();
    switch (value.registrationMode as RegistrationMode) {
      case 'jwt':
        return value.registrationJwt.trim() ? { jwt: value.registrationJwt.trim() } : null;
      case 'id':
        return value.registrationId.trim() ? { id: value.registrationId.trim() } : null;
      case 'body': {
        const purpose = value.purposes
          .map((entry) => ({ lang: entry.lang.trim(), content: entry.content.trim() }))
          .filter((entry) => entry.lang && entry.content);
        return {
          body: {
            ...(purpose.length ? { purpose } : {}),
            ...(value.privacyPolicy.trim() ? { privacy_policy: value.privacyPolicy.trim() } : {}),
            ...(value.supportUri.trim() ? { support_uri: value.supportUri.trim() } : {}),
            ...(value.intermediary.trim() ? { intermediary: value.intermediary.trim() } : {}),
          },
        };
      }
      default:
        return null;
    }
  }

  private integrationReferenceError(query: object | undefined): string | null {
    const ids = new Set(
      (query as { credentials?: { id?: string }[] } | undefined)?.credentials?.map(
        (credential) => credential.id
      ) ?? []
    );
    for (const [label, raw] of [
      ['Attached data', this.form.controls.attached.value],
      ['Transaction data', this.form.controls.transactionData.value],
    ] as const) {
      if (!raw.trim()) continue;
      try {
        const entries: unknown = JSON.parse(raw);
        if (!Array.isArray(entries)) continue;
        for (const entry of entries) {
          if (!isRecord(entry) || !Array.isArray(entry['credential_ids'])) continue;
          const missing = entry['credential_ids'].find(
            (credentialId: unknown) => typeof credentialId === 'string' && !ids.has(credentialId)
          );
          if (missing) {
            return `${label} refers to missing credential "${String(missing)}". Update its credential IDs in the request settings.`;
          }
        }
      } catch {
        return null;
      }
    }
    return null;
  }

  protected statusModeValue(): PresentationConfig['statusCheckMode'] {
    return statusCheckModeOf({ statusCheckMode: this.form.controls.statusCheckMode.value });
  }

  protected selectedTemplate(name: string): void {
    const template = this.templates.find((entry) => entry.name === name);
    if (template) this.loadTemplate(template);
  }

  protected registrationSource(): string {
    const spec = this.registrationCertificate();
    return spec ? registrationCertSourceLabel({ registration_cert: spec }) : 'None';
  }

  protected errorMessage(error: unknown): string {
    return getApiErrorMessage(error, 'Failed to load the presentation configuration');
  }

  protected notFound(error: unknown): boolean {
    return hasHttpStatus(error, 404);
  }

  protected readonly defaultLifetime = DEFAULT_LIFETIME;
  protected readonly pageOrigin = globalThis.location?.origin ?? '';
  protected readonly queryPreview = computed(() => draftQuery(this.draft()).query);

  protected onJsonState(state: string): void {
    if (state === 'closed') this.jsonOpen.set(false);
  }

  protected modeHint(value: string): string {
    return this.modes.find((mode) => mode.value === value)?.hint ?? '';
  }
}
