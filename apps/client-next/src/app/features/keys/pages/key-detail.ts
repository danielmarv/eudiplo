import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { JsonPipe } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import type { CertificateInfoDto, KeyChainResponseDto } from '@eudiplo/sdk-core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideArrowLeft,
  lucideBraces,
  lucideCalendarClock,
  lucideCircleAlert,
  lucideClipboard,
  lucideDownload,
  lucideEdit,
  lucideFileKey,
  lucideKeyRound,
  lucideLock,
  lucideRefreshCw,
  lucideRotateCw,
  lucideShieldCheck,
  lucideStar,
  lucideStarOff,
  lucideTrash2,
  lucideTriangleAlert,
} from '@ng-icons/lucide';
import { HlmAlertDialogImports } from '@spartan-ng/helm/alert-dialog';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import { HlmDialogImports } from '@spartan-ng/helm/dialog';
import { HlmSkeletonImports } from '@spartan-ng/helm/skeleton';
import { HlmSpinnerImports } from '@spartan-ng/helm/spinner';
import { HlmTooltipImports } from '@spartan-ng/helm/tooltip';
import { injectMutation, injectQuery, QueryClient } from '@tanstack/angular-query-experimental';
import { CallerService } from '../../../core/auth/caller.service';
import { ConfigDocumentService } from '../../../shared/config-ownership/config-document.service';
import { TENANT_ADMIN_ROLES } from '../../../core/auth/role-grants';
import { SessionService } from '../../../core/auth/session.service';
import { getApiErrorMessage } from '../../../core/errors/error-message';
import { NotifyService } from '../../../core/notify/notify.service';
import { copyText } from '../../../shared/clipboard/copy-text';
import {
  configOwnershipQuery,
  fileManaged,
  lockReason,
} from '../../../shared/config-ownership/config-ownership';
import { OwnershipNotice } from '../../../shared/config-ownership/ownership-notice';
import { dateTime } from '../../../shared/format/date-time';
import { PageHeader } from '../../../shared/pages/page-header';
import { KeyCertificateRequest } from '../components/key-certificate-request';
import {
  certificateIsExpired,
  certificateIsSelfSigned,
  defaultAccessChip,
  defaultAccessDeleteRefusal,
  defaultAccessToggleLabel,
  defaultAccessToggleTooltip,
  isConfiguredDefaultAccess,
  isJwkPublishedKey,
  keyChainDeleteQuestion,
  offersCertificateRequest,
  usageLabel,
} from '../data/key-display';
import {
  defaultAccessKeyChainKey,
  defaultAccessKeyChainQuery,
  deleteKeyChainMutation,
  enrollKeyAtRegistrarMutation,
  keyChainKey,
  keyChainQuery,
  keyChainsKey,
  rotateKeyChainMutation,
  setDefaultAccessKeyChainMutation,
} from '../data/key-queries';
import { ConfirmService } from '../../../shared/dialogs/confirm';
import { registrarConfigQuery } from '../../registrar/data/registrar-queries';

type PendingAction = { kind: 'delete' | 'rotate'; key: KeyChainResponseDto } | null;

/** Public metadata and certificate lifecycle for one key chain. */
@Component({
  selector: 'app-key-detail',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    JsonPipe,
    NgIcon,
    HlmAlertDialogImports,
    HlmButtonImports,
    HlmDialogImports,
    HlmSkeletonImports,
    HlmSpinnerImports,
    HlmTooltipImports,
    KeyCertificateRequest,
    OwnershipNotice,
    PageHeader,
  ],
  providers: [
    provideIcons({
      lucideArrowLeft,
      lucideBraces,
      lucideCalendarClock,
      lucideCircleAlert,
      lucideClipboard,
      lucideDownload,
      lucideEdit,
      lucideFileKey,
      lucideKeyRound,
      lucideLock,
      lucideRefreshCw,
      lucideRotateCw,
      lucideShieldCheck,
      lucideStar,
      lucideStarOff,
      lucideTrash2,
      lucideTriangleAlert,
    }),
  ],
  templateUrl: './key-detail.html',
})
export class KeyDetail {
  readonly keyId = input.required<string>();

  private readonly instance = inject(SessionService).getBaseUrl();
  private readonly caller = inject(CallerService);
  private readonly tenant = computed(() => this.caller.loadedCaller()?.tenantId);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly queryClient = inject(QueryClient);
  private readonly notify = inject(NotifyService);
  private readonly confirm = inject(ConfirmService);

  protected readonly key = injectQuery(() =>
    keyChainQuery(this.instance, this.tenant(), this.keyId())
  );
  protected readonly defaults = injectQuery(() =>
    defaultAccessKeyChainQuery(this.instance, this.tenant())
  );
  private readonly ownership = injectQuery(() =>
    configOwnershipQuery(this.instance, this.tenant(), 'KeyChain')
  );
  protected readonly ownershipResource = computed(() =>
    this.ownership.data()?.find((resource) => resource.resourceId === this.keyId())
  );
  private readonly defaultsOwnership = injectQuery(() =>
    configOwnershipQuery(this.instance, this.tenant(), 'KeyChainDefaults')
  );
  protected readonly registrar = injectQuery(() =>
    registrarConfigQuery(
      this.instance,
      this.tenant(),
      this.caller.hasRole('registrar:manage') && this.isEnrollableKey
    )
  );

  private readonly deletion = injectMutation(() => deleteKeyChainMutation());
  private readonly rotation = injectMutation(() => rotateKeyChainMutation());
  private readonly defaultChange = injectMutation(() => setDefaultAccessKeyChainMutation());
  private readonly registrarEnrollment = injectMutation(() => enrollKeyAtRegistrarMutation());
  protected readonly documents = inject(ConfigDocumentService);

  protected readonly pendingAction = signal<PendingAction>(null);
  /** Exporting a key chain document needs a tenant admin, as Config Portability does. */
  protected readonly canExport = computed(() => {
    const caller = this.caller.loadedCaller();
    return !!caller?.tenantId && TENANT_ADMIN_ROLES.some((role) => caller.roles.includes(role));
  });
  protected readonly lock = computed(() => {
    const resource = fileManaged(this.ownership.data()).get(this.keyId());
    return resource ? lockReason(resource) : '';
  });
  protected readonly defaultsLock = computed(() => {
    const resource = fileManaged(this.defaultsOwnership.data()).get('defaults');
    return resource ? lockReason(resource) : '';
  });
  protected readonly saving = computed(
    () =>
      this.deletion.isPending() ||
      this.rotation.isPending() ||
      this.defaultChange.isPending() ||
      this.registrarEnrollment.isPending()
  );
  protected readonly usageLabel = usageLabel;
  protected readonly dateTime = dateTime;
  protected readonly isDefault = isConfiguredDefaultAccess;
  protected readonly defaultChip = defaultAccessChip;
  protected readonly defaultToggleLabel = defaultAccessToggleLabel;
  protected readonly defaultToggleTooltip = defaultAccessToggleTooltip;
  protected readonly certExpired = (certificate: CertificateInfoDto) =>
    certificateIsExpired(certificate.notAfter);

  protected get defaultLoadingError(): boolean {
    return this.key.data()?.usageType === 'access' && this.defaults.isError();
  }

  protected get canRotate(): boolean {
    return !!this.key.data()?.rotationPolicy.enabled;
  }

  protected get showCertificateRequest(): boolean {
    const key = this.key.data();
    return !!key && offersCertificateRequest(key);
  }

  protected get startCertificateRequest(): boolean {
    return this.route.snapshot.queryParamMap.get('certificate') === 'request';
  }

  protected get publishesJwk(): boolean {
    const key = this.key.data();
    return !!key && isJwkPublishedKey(key);
  }

  protected get registrarConfigured(): boolean {
    return this.registrar.isSuccess() && !!this.registrar.data();
  }

  protected get registrarMissing(): boolean {
    return (
      this.caller.hasRole('registrar:manage') &&
      this.isEnrollableKey &&
      this.registrar.isSuccess() &&
      !this.registrar.data()
    );
  }

  protected get canEnrollWithRegistrar(): boolean {
    return (
      this.caller.hasRole('registrar:manage') &&
      this.isEnrollableKey &&
      (this.registrarConfigured || this.registrar.isError())
    );
  }

  protected get isEnrolling(): boolean {
    return this.registrarEnrollment.isPending();
  }

  protected get isEnrollableKey(): boolean {
    const key = this.key.data();
    return key?.type === 'standalone' && key.usageType === 'access';
  }

  protected get registrarContactMissing(): boolean {
    const contact = this.registrar.data()?.relyingPartyContact;
    return (
      this.registrarConfigured &&
      !contact?.email?.trim() &&
      !contact?.phone?.trim() &&
      !contact?.supportUri?.trim()
    );
  }

  protected keyName(key: KeyChainResponseDto): string {
    return key.description || key.id;
  }

  protected typeDescription(key: KeyChainResponseDto): string {
    if (key.type === 'internalChain') {
      return 'This key chain has an embedded root CA that issues the active signing certificate.';
    }
    if (key.usageType === 'federation') {
      return 'This standalone public key is published in the OpenID Federation entity configuration.';
    }
    if (key.usageType === 'authorizationServer') {
      return 'This standalone public key is published in the authorization servers’ JWKS.';
    }
    if (!key.activeCertificate) return 'This is a standalone key.';
    return certificateIsSelfSigned(key.activeCertificate)
      ? 'This is a self-signed standalone key.'
      : 'This is a standalone key with a certificate issued by the CA shown below.';
  }

  /** Whether the key chain shows as JSON, as the API returns it. */
  protected readonly showJson = signal(false);

  protected copyJson(key: object): void {
    void copyText(this.notify, JSON.stringify(key, null, 2), 'Key chain JSON');
  }

  protected copyPublicKey(key: object, title = 'Public key (JWK)'): void {
    void copyText(this.notify, JSON.stringify(key, null, 2), title);
  }

  protected copyCertificate(certificate: CertificateInfoDto): void {
    void copyText(this.notify, certificate.pem, 'Certificate');
  }

  protected retry(): void {
    void this.key.refetch();
  }

  protected toggleDefault(): void {
    const key = this.key.data();
    if (!key || key.usageType !== 'access' || !this.defaults.isSuccess() || this.saving()) return;
    if (this.defaultsLock()) {
      this.notify.error(this.defaultsLock());
      return;
    }
    this.defaultChange.mutate(this.isDefault(this.defaults.data(), key.id) ? null : key.id, {
      onSuccess: (info) => {
        this.queryClient.setQueryData(defaultAccessKeyChainKey(this.instance, this.tenant()), info);
        this.notify.success(
          info.defaultAccessKeyChainId
            ? 'Default access key chain set.'
            : 'Default access key chain removed; EUDIPLO picks one by rule.'
        );
      },
      onError: (error) =>
        this.notify.error(
          getApiErrorMessage(error, 'Failed to change the default access key chain')
        ),
    });
  }

  protected requestDelete(key: KeyChainResponseDto): void {
    const refusal = defaultAccessDeleteRefusal(this.defaults.data(), key.id);
    if (refusal) {
      this.notify.error(refusal);
      return;
    }
    if (this.lock()) {
      this.notify.error(this.lock());
      return;
    }
    this.pendingAction.set({ kind: 'delete', key });
  }

  protected requestRotation(key: KeyChainResponseDto): void {
    if (!key.rotationPolicy.enabled) return;
    if (this.lock()) {
      this.notify.error(this.lock());
      return;
    }
    this.pendingAction.set({ kind: 'rotate', key });
  }

  protected closeActionDialog(): void {
    if (!this.saving()) this.pendingAction.set(null);
  }

  protected confirmAction(): void {
    const action = this.pendingAction();
    if (!action || this.saving()) return;
    if (this.lock()) {
      this.pendingAction.set(null);
      this.notify.error(this.lock());
      return;
    }
    if (action.kind === 'delete') {
      const refusal = defaultAccessDeleteRefusal(this.defaults.data(), action.key.id);
      if (refusal) {
        this.pendingAction.set(null);
        this.notify.error(refusal);
        return;
      }
      this.deletion.mutate(action.key.id, {
        onSuccess: () => {
          this.pendingAction.set(null);
          this.notify.success('Key chain deleted.');
          void this.queryClient.invalidateQueries({
            queryKey: keyChainsKey(this.instance, this.tenant()),
            exact: true,
          });
          void this.router.navigate(['/keys']);
        },
        onError: (error) => {
          this.pendingAction.set(null);
          this.notify.error(getApiErrorMessage(error, 'Failed to delete the key chain'));
        },
      });
      return;
    }
    this.rotation.mutate(action.key.id, {
      onSuccess: () => {
        this.pendingAction.set(null);
        this.notify.success('Key chain rotated.');
        void this.invalidateKey(action.key.id);
      },
      onError: (error) => {
        this.pendingAction.set(null);
        this.notify.error(getApiErrorMessage(error, 'Failed to rotate the key chain'));
      },
    });
  }

  /**
   * Downloads the key chain as a configuration document, the format of the config folder: for a
   * key held in the database it includes the private key, so the file can be imported again.
   */
  protected exportKey(): void {
    const key = this.key.data();
    if (!key || !this.canExport()) return;
    void this.documents.download('KeyChain', key.id);
  }

  protected exporting(): boolean {
    const key = this.key.data();
    return !!key && this.documents.isDownloading('KeyChain', key.id);
  }

  protected async enrollWithRegistrar(): Promise<void> {
    const key = this.key.data();
    if (!key || !this.canEnrollWithRegistrar || this.isEnrolling || this.lock()) return;
    const certificate = key.activeCertificate;
    const warnings: string[] = [];
    if (certificate && !certificateIsSelfSigned(certificate)) {
      warnings.push(
        `This replaces the active certificate issued by “${certificate.issuer}”. The key stays the same, but the current certificate is no longer used.`
      );
    }
    if (key.rotationPolicy.enabled) {
      warnings.push(
        'This key rotates automatically. Its next rotation replaces the registrar certificate with a self-signed certificate for a new key.'
      );
    }
    if (
      warnings.length &&
      !(await this.confirm.ask({
        title: 'Enroll with the registrar?',
        description: warnings,
        confirm: 'Enroll with the registrar',
      }))
    ) {
      return;
    }
    this.registrarEnrollment.mutate(key.id, {
      onSuccess: () => {
        this.notify.success('Access certificate enrolled through the registrar.');
        void this.invalidateKey(key.id);
      },
      onError: (error) => {
        this.notify.error(getApiErrorMessage(error, 'Failed to enroll the access certificate'));
        void this.invalidateKey(key.id);
      },
    });
  }

  protected certificateSaved(): void {
    if (this.startCertificateRequest) {
      void this.router.navigate([], {
        relativeTo: this.route,
        queryParams: { certificate: null },
        queryParamsHandling: 'merge',
        replaceUrl: true,
      });
    }
    void this.invalidateKey(this.keyId());
  }

  protected actionDescription(action: PendingAction): string {
    if (!action) return '';
    if (action.kind === 'delete') return keyChainDeleteQuestion(action.key);
    return `The current signing key of ${this.keyName(action.key)} moves into the previous-key grace period. A new key and certificate become active.`;
  }

  protected errorMessage(error: unknown): string {
    return getApiErrorMessage(error, 'Failed to load the key chain');
  }

  private async invalidateKey(id: string): Promise<void> {
    await Promise.all([
      this.queryClient.invalidateQueries({
        queryKey: keyChainKey(this.instance, this.tenant(), id),
        exact: true,
      }),
      this.queryClient.invalidateQueries({
        queryKey: keyChainsKey(this.instance, this.tenant()),
        exact: true,
      }),
    ]);
  }
}
