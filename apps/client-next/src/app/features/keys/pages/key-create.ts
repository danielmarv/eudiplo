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
  type AbstractControl,
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  type ValidationErrors,
  Validators,
} from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router, RouterLink } from '@angular/router';
import type { KeyChainCreateDto, KeyChainImportDto, KmsProviderInfoDto } from '@eudiplo/sdk-core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideArrowLeft,
  lucideArrowRight,
  lucideCheck,
  lucideCircleAlert,
  lucideFileKey,
  lucideInfo,
  lucideKeyRound,
  lucideRefreshCw,
  lucideShieldCheck,
  lucideUpload,
} from '@ng-icons/lucide';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import { HlmFieldImports } from '@spartan-ng/helm/field';
import { HlmInputImports } from '@spartan-ng/helm/input';
import { HlmNativeSelectImports } from '@spartan-ng/helm/native-select';
import { HlmSkeletonImports } from '@spartan-ng/helm/skeleton';
import { HlmSpinnerImports } from '@spartan-ng/helm/spinner';
import { HlmTooltipImports } from '@spartan-ng/helm/tooltip';
import { injectMutation, injectQuery, QueryClient } from '@tanstack/angular-query-experimental';
import { merge } from 'rxjs';
import { CallerService } from '../../../core/auth/caller.service';
import { SessionService } from '../../../core/auth/session.service';
import { getApiErrorMessage } from '../../../core/errors/error-message';
import { NotifyService } from '../../../core/notify/notify.service';
import { showFieldsToFix } from '../../../shared/forms/field-to-fix';
import { PageHeader } from '../../../shared/pages/page-header';
import { readCertificateFiles } from '../data/certificate-files';
import {
  KEY_USAGES,
  type CertificateSource,
  type ExternalCertificateMode,
  type KeyChainTypeSelection,
  type KeyUsageCreate,
  parseCertificateChain,
  parseExternalPrivateKey,
} from '../data/key-display';
import {
  createKeyChainMutation,
  createRegistrarKeyMutation,
  importKeyChainMutation,
  keyChainKey,
  keyChainsKey,
  keyProvidersQuery,
} from '../data/key-queries';
import { registrarConfigQuery } from '../../registrar/data/registrar-queries';

type SigningAlgorithm = NonNullable<KeyChainCreateDto['alg']>;
type Step = 'usage' | 'strategy' | 'configure';

const ALGORITHM_LABELS: Record<SigningAlgorithm, string> = {
  ES256: 'ES256 (ECDSA P-256)',
  ES384: 'ES384 (ECDSA P-384)',
  ES512: 'ES512 (ECDSA P-521)',
};

function requiredText(control: AbstractControl): ValidationErrors | null {
  return typeof control.value === 'string' && control.value.trim() ? null : { required: true };
}

/** Three-step key creation flow, including external key import and certificate enrollment. */
@Component({
  selector: 'app-key-create',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    RouterLink,
    NgIcon,
    HlmButtonImports,
    HlmFieldImports,
    HlmInputImports,
    HlmNativeSelectImports,
    HlmSkeletonImports,
    HlmSpinnerImports,
    HlmTooltipImports,
    PageHeader,
  ],
  providers: [
    provideIcons({
      lucideArrowLeft,
      lucideArrowRight,
      lucideCheck,
      lucideCircleAlert,
      lucideFileKey,
      lucideInfo,
      lucideKeyRound,
      lucideRefreshCw,
      lucideShieldCheck,
      lucideUpload,
    }),
  ],
  templateUrl: './key-create.html',
})
export class KeyCreate {
  private readonly instance = inject(SessionService).getBaseUrl();
  private readonly caller = inject(CallerService);
  private readonly tenant = computed(() => this.caller.loadedCaller()?.tenantId);
  private readonly router = inject(Router);
  private readonly queryClient = inject(QueryClient);
  private readonly notify = inject(NotifyService);
  private readonly injector = inject(Injector);
  private readonly formElement = viewChild<ElementRef<HTMLFormElement>>('formElement');

  protected readonly step = signal<Step>('usage');
  protected readonly isSubmitting = signal(false);
  protected readonly providers = injectQuery(() => keyProvidersQuery(this.instance, this.tenant()));
  protected readonly registrar = injectQuery(() =>
    registrarConfigQuery(this.instance, this.tenant(), this.canUseRegistrar)
  );
  protected readonly keyUsages = KEY_USAGES;

  protected readonly usageForm = new FormGroup({
    usage: new FormControl<KeyUsageCreate | ''>('', {
      nonNullable: true,
      validators: [Validators.required],
    }),
  });
  protected readonly strategyForm = new FormGroup({
    keyChainType: new FormControl<KeyChainTypeSelection>('internalChain', { nonNullable: true }),
    certificateSource: new FormControl<CertificateSource>('selfSigned', { nonNullable: true }),
  });
  protected readonly form = new FormGroup({
    description: new FormControl('', { nonNullable: true }),
    kmsProvider: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    alg: new FormControl<SigningAlgorithm>('ES256', {
      nonNullable: true,
      validators: [Validators.required],
    }),
    rotationEnabled: new FormControl(true, { nonNullable: true }),
    rotationIntervalDays: new FormControl<number | null>(30, [
      Validators.required,
      Validators.min(1),
      Validators.max(3650),
      Validators.pattern(/^\d+$/),
    ]),
    certValidityDays: new FormControl<number | null>(365, [
      Validators.required,
      Validators.min(1),
      Validators.max(3650),
      Validators.pattern(/^\d+$/),
    ]),
    useExternalCertificate: new FormControl(false, { nonNullable: true }),
    externalCertificateMode: new FormControl<ExternalCertificateMode>('import', {
      nonNullable: true,
    }),
    externalPrivateKey: new FormControl('', { nonNullable: true }),
    externalCertificate: new FormControl('', { nonNullable: true }),
  });

  private readonly creation = injectMutation(() => createKeyChainMutation());
  private readonly importer = injectMutation(() => importKeyChainMutation());
  private readonly registrarCreation = injectMutation(() => createRegistrarKeyMutation());

  // Form values are not signals: read them on every check, as the template events that change
  // them mark the view for checking.
  protected readonly activeUsage = () => this.usageForm.controls.usage.value;
  protected readonly selectedKeyChainType = () => this.strategyForm.controls.keyChainType.value;
  protected readonly selectedCertificateSource = () =>
    this.strategyForm.controls.certificateSource.value;
  protected readonly submitting = computed(
    () =>
      this.creation.isPending() || this.importer.isPending() || this.registrarCreation.isPending()
  );

  constructor() {
    effect(() => {
      const providers = this.providers.data();
      if (!providers) return;
      untracked(() => {
        const selected = this.form.controls.kmsProvider.value;
        const name = providers.providers.some((provider) => provider.name === selected)
          ? selected
          : providers.default;
        this.form.controls.kmsProvider.setValue(name);
        this.selectDefaultAlgorithm(name);
        this.syncValidators();
      });
    });
    merge(
      this.usageForm.valueChanges,
      this.strategyForm.valueChanges,
      this.form.controls.rotationEnabled.valueChanges,
      this.form.controls.useExternalCertificate.valueChanges,
      this.form.controls.externalCertificateMode.valueChanges
    )
      .pipe(takeUntilDestroyed())
      .subscribe(() => this.syncValidators());
  }

  protected get canUseRegistrar(): boolean {
    return this.caller.hasRole('registrar:manage');
  }

  /** The steps the chosen purpose has, numbered, with the ones already done. */
  protected get steps(): {
    id: Step;
    label: string;
    number: number;
    done: boolean;
    current: boolean;
  }[] {
    const all: { id: Step; label: string }[] = [
      { id: 'usage', label: 'Usage' },
      ...(this.hasStrategyStep ? [{ id: 'strategy' as Step, label: 'Key and certificate' }] : []),
      { id: 'configure', label: 'Configure' },
    ];
    const current = all.findIndex((item) => item.id === this.step());
    return all.map((item, index) => ({
      ...item,
      number: index + 1,
      done: index < current,
      current: index === current,
    }));
  }

  protected get hasStrategyStep(): boolean {
    return (
      this.activeUsage() === 'attestation' ||
      this.activeUsage() === 'statusList' ||
      this.activeUsage() === 'access'
    );
  }

  protected get isInternalChain(): boolean {
    return (
      (this.activeUsage() === 'attestation' || this.activeUsage() === 'statusList') &&
      (this.selectedKeyChainType() === 'internalChain' ||
        this.selectedKeyChainType() === 'externalCaChain')
    );
  }

  protected get isExternalCaChain(): boolean {
    return this.isInternalChain && this.selectedKeyChainType() === 'externalCaChain';
  }

  protected get isExternalCertificate(): boolean {
    if (this.activeUsage() === 'access') return this.selectedCertificateSource() === 'external';
    return (
      this.isExternalCaChain ||
      ((this.activeUsage() === 'attestation' || this.activeUsage() === 'statusList') &&
        this.selectedKeyChainType() === 'standalone' &&
        this.form.controls.useExternalCertificate.value)
    );
  }

  protected get requestsCertificate(): boolean {
    return (
      this.isExternalCertificate &&
      !this.isExternalCaChain &&
      this.form.controls.externalCertificateMode.value === 'csr'
    );
  }

  protected get importsExternalKey(): boolean {
    return this.isExternalCertificate && !this.requestsCertificate;
  }

  protected get showAlgorithm(): boolean {
    return (
      !this.importsExternalKey &&
      !(this.activeUsage() === 'access' && this.selectedCertificateSource() === 'registrar')
    );
  }

  protected get algorithms(): { value: SigningAlgorithm; label: string }[] {
    const provider = this.currentProvider();
    return (provider?.capabilities.supportedAlgs ?? ['ES256'])
      .filter((alg): alg is SigningAlgorithm => alg in ALGORITHM_LABELS)
      .map((value) => ({ value, label: ALGORITHM_LABELS[value] }));
  }

  protected get currentProvider(): () => KmsProviderInfoDto | undefined {
    return () =>
      this.providers
        .data()
        ?.providers.find((provider) => provider.name === this.form.controls.kmsProvider.value);
  }

  protected get providerCanImport(): boolean {
    return !!this.currentProvider()?.capabilities.canImport;
  }

  protected get defaultDescription(): string {
    switch (this.activeUsage()) {
      case 'attestation':
        return 'Credential Signing Key';
      case 'statusList':
        return 'Status List Signing Key';
      case 'access':
        return 'Access Certificate';
      case 'authorizationServer':
        return 'Authorization Server Key';
      case 'trustList':
        return 'Trust List Signing Key';
      case 'federation':
        return 'OpenID Federation Entity Key';
      default:
        return 'Key';
    }
  }

  protected get actionLabel(): string {
    if (this.selectedCertificateSource() === 'registrar' && this.activeUsage() === 'access')
      return 'Create and enroll';
    if (this.importsExternalKey)
      return this.isExternalCaChain ? 'Import CA and create chain' : 'Import key and certificate';
    return 'Create key chain';
  }

  protected nextFromUsage(): void {
    if (this.usageForm.invalid) {
      this.usageForm.markAllAsTouched();
      return;
    }
    this.step.set(this.hasStrategyStep ? 'strategy' : 'configure');
  }

  protected nextFromStrategy(): void {
    if (this.activeUsage() === 'access' && this.selectedCertificateSource() === 'registrar') {
      if (!this.canUseRegistrar) {
        this.notify.error('Enrolling through the registrar needs the registrar:manage role.');
        return;
      }
      if (this.registrar.isError()) {
        this.notify.error(
          getApiErrorMessage(this.registrar.error(), 'Could not check the registrar configuration')
        );
        return;
      }
      if (this.registrar.isSuccess() && !this.registrar.data()) {
        this.notify.warning('Configure registrar credentials before enrolling an access key.');
        return;
      }
    }
    this.step.set('configure');
  }

  protected back(): void {
    if (this.step() === 'configure') this.step.set(this.hasStrategyStep ? 'strategy' : 'usage');
    else if (this.step() === 'strategy') this.step.set('usage');
  }

  protected onProviderChange(): void {
    this.selectDefaultAlgorithm(this.form.controls.kmsProvider.value);
  }

  protected async loadPrivateKey(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    try {
      this.form.controls.externalPrivateKey.setValue(await file.text());
    } catch {
      this.notify.error('Could not read the selected key file.');
    }
    input.value = '';
  }

  protected async loadCertificates(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const files = input.files;
    if (!files?.length) return;
    try {
      this.form.controls.externalCertificate.setValue(await readCertificateFiles(files));
    } catch {
      this.notify.error('Could not read the selected certificate files.');
    }
    input.value = '';
  }

  protected submit(): void {
    if (this.submitting() || this.isSubmitting()) return;
    if (this.providers.isError()) {
      this.notify.error(
        getApiErrorMessage(this.providers.error(), 'The KMS providers could not be loaded')
      );
      return;
    }
    if (this.providers.isPending()) {
      this.notify.info('Wait for the KMS providers to load before creating a key.');
      return;
    }
    if (this.importsExternalKey && !this.providerCanImport) {
      this.notify.error('The selected KMS provider does not support importing keys.');
      return;
    }
    if (this.form.invalid) {
      showFieldsToFix(this.form, {
        notify: this.notify,
        injector: this.injector,
        container: () => this.formElement()?.nativeElement,
        sections: [
          {
            name: 'Key settings',
            controls: [
              this.form.controls.kmsProvider,
              this.form.controls.alg,
              this.form.controls.externalPrivateKey,
              this.form.controls.externalCertificate,
            ],
          },
          {
            name: 'Rotation policy',
            controls: [
              this.form.controls.rotationIntervalDays,
              this.form.controls.certValidityDays,
            ],
          },
        ],
      });
      return;
    }
    this.isSubmitting.set(true);
    if (this.activeUsage() === 'access' && this.selectedCertificateSource() === 'registrar') {
      this.createAtRegistrar();
    } else if (this.importsExternalKey) {
      this.importExternalKey();
    } else {
      this.createKeyChain();
    }
  }

  protected readonly getApiErrorMessage = getApiErrorMessage;

  protected errorMessage(error: unknown): string {
    return getApiErrorMessage(error, 'Could not load the KMS providers');
  }

  private syncValidators(): void {
    const interval = this.form.controls.rotationIntervalDays;
    const validity = this.form.controls.certValidityDays;
    if (this.isInternalChain) {
      validity.enable({ emitEvent: false });
      if (this.form.controls.rotationEnabled.value) interval.enable({ emitEvent: false });
      else interval.disable({ emitEvent: false });
    } else {
      interval.disable({ emitEvent: false });
      validity.disable({ emitEvent: false });
    }
    for (const control of [
      this.form.controls.externalPrivateKey,
      this.form.controls.externalCertificate,
    ]) {
      if (this.importsExternalKey) control.setValidators([requiredText]);
      else control.clearValidators();
      control.updateValueAndValidity({ emitEvent: false });
    }
    if (!this.showAlgorithm) this.form.controls.alg.disable({ emitEvent: false });
    else this.form.controls.alg.enable({ emitEvent: false });
  }

  private selectDefaultAlgorithm(providerName: string): void {
    const provider = this.providers.data()?.providers.find((item) => item.name === providerName);
    const options = provider?.capabilities.supportedAlgs.filter(
      (alg): alg is SigningAlgorithm => alg in ALGORITHM_LABELS
    ) ?? ['ES256'];
    const preferred = options.find((alg) => alg === provider?.capabilities.defaultAlg);
    const selected = this.form.controls.alg.value;
    this.form.controls.alg.setValue(
      options.includes(selected) ? selected : (preferred ?? options[0] ?? 'ES256')
    );
  }

  private createRequest(): KeyChainCreateDto {
    const value = this.form.getRawValue();
    return {
      usageType: this.activeUsage() as KeyUsageCreate,
      type:
        this.activeUsage() === 'access' || !this.isInternalChain ? 'standalone' : 'internalChain',
      description: value.description.trim() || this.defaultDescription,
      kmsProvider: value.kmsProvider,
      ...(this.showAlgorithm ? { alg: value.alg } : {}),
      ...(this.isInternalChain
        ? {
            rotationPolicy: {
              enabled: value.rotationEnabled,
              intervalDays: value.rotationEnabled
                ? (value.rotationIntervalDays ?? undefined)
                : undefined,
              certValidityDays: value.certValidityDays ?? undefined,
            },
          }
        : {}),
    };
  }

  private createKeyChain(): void {
    const body = this.createRequest();
    this.creation.mutate(body, {
      onSuccess: (created) => {
        this.rememberNewKey(created.id);
        if (this.requestsCertificate) {
          this.notify.info(
            'Key created. Create a CSR on its page and store the certificate your CA issues.'
          );
          void this.router.navigate(['/keys', created.id], {
            queryParams: { certificate: 'request' },
          });
        } else {
          this.notify.success('Key chain created.');
          void this.router.navigate(['/keys', created.id]);
        }
      },
      onError: (error) => {
        this.isSubmitting.set(false);
        this.notify.error(getApiErrorMessage(error, 'Failed to create the key chain'));
      },
      onSettled: () => this.isSubmitting.set(false),
    });
  }

  private importExternalKey(): void {
    try {
      const values = this.form.getRawValue();
      const keyMaterial = parseExternalPrivateKey(values.externalPrivateKey);
      const certificateChain = parseCertificateChain(values.externalCertificate);
      if (!certificateChain.length) throw new Error('Provide at least one certificate.');
      const body: KeyChainImportDto = {
        ...keyMaterial,
        usageType: this.activeUsage() as KeyUsageCreate,
        type: this.isExternalCaChain ? 'internalChain' : 'standalone',
        description: values.description.trim() || this.defaultDescription,
        kmsProvider: values.kmsProvider,
        crt: certificateChain,
        ...(this.isExternalCaChain
          ? {
              rotationPolicy: {
                enabled: values.rotationEnabled,
                intervalDays: values.rotationEnabled
                  ? (values.rotationIntervalDays ?? undefined)
                  : undefined,
                certValidityDays: values.certValidityDays ?? undefined,
              },
            }
          : {}),
      };
      this.importer.mutate(body, {
        onSuccess: (created) => {
          this.rememberNewKey(created.id);
          this.notify.success(
            this.isExternalCaChain
              ? 'CA imported and signing key created.'
              : 'Key and certificate imported.'
          );
          void this.router.navigate(['/keys', created.id]);
        },
        onError: (error) => {
          this.isSubmitting.set(false);
          this.notify.error(getApiErrorMessage(error, 'Failed to import the key chain'));
        },
        onSettled: () => this.isSubmitting.set(false),
      });
    } catch (error) {
      this.isSubmitting.set(false);
      this.notify.error(
        error instanceof Error ? error.message : 'The key or certificate could not be read.'
      );
    }
  }

  private createAtRegistrar(): void {
    const values = this.form.getRawValue();
    this.registrarCreation.mutate(
      {
        description: values.description.trim() || this.defaultDescription,
        kmsProvider: values.kmsProvider,
      },
      {
        onSuccess: (created) => {
          this.rememberNewKey(created.id);
          this.notify.success('Access certificate enrolled through the registrar.');
          void this.router.navigate(['/keys', created.id]);
        },
        onError: (error) => {
          this.isSubmitting.set(false);
          this.notify.error(
            getApiErrorMessage(error, 'Failed to create and enroll the access key')
          );
        },
        onSettled: () => this.isSubmitting.set(false),
      }
    );
  }

  private rememberNewKey(id: string): void {
    void this.queryClient.invalidateQueries({
      queryKey: keyChainsKey(this.instance, this.tenant()),
      exact: true,
    });
    void this.queryClient.invalidateQueries({
      queryKey: keyChainKey(this.instance, this.tenant(), id),
    });
  }
}
