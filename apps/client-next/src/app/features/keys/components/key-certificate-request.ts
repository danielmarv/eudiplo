import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import type { KeyChainResponseDto } from '@eudiplo/sdk-core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideAlertTriangle,
  lucideClipboard,
  lucideDownload,
  lucideFileKey,
  lucideLock,
  lucideRefreshCw,
  lucideSave,
  lucideUpload,
} from '@ng-icons/lucide';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import { HlmFieldImports } from '@spartan-ng/helm/field';
import { HlmInputImports } from '@spartan-ng/helm/input';
import { HlmSpinnerImports } from '@spartan-ng/helm/spinner';
import { HlmTooltipImports } from '@spartan-ng/helm/tooltip';
import { injectMutation } from '@tanstack/angular-query-experimental';
import { getApiErrorMessage } from '../../../core/errors/error-message';
import { NotifyService } from '../../../core/notify/notify.service';
import { copyText } from '../../../shared/clipboard/copy-text';
import { readCertificateFiles } from '../data/certificate-files';
import { createCsrMutation, updateKeyChainMutation } from '../data/key-queries';
import { certificateIsSelfSigned } from '../data/key-display';
import { ConfirmService } from '../../../shared/dialogs/confirm';

/**
 * Request a CSR for a key kept in EUDIPLO, then import the issued public certificate chain.
 * The private key never leaves its KMS.
 */
@Component({
  selector: 'app-key-certificate-request',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    RouterLink,
    NgIcon,
    HlmButtonImports,
    HlmFieldImports,
    HlmInputImports,
    HlmSpinnerImports,
    HlmTooltipImports,
  ],
  providers: [
    provideIcons({
      lucideAlertTriangle,
      lucideClipboard,
      lucideDownload,
      lucideFileKey,
      lucideLock,
      lucideRefreshCw,
      lucideSave,
      lucideUpload,
    }),
  ],
  template: `
    <section
      class="bg-card grid gap-5 rounded-2xl p-5 shadow-sm ring-1 ring-black/5 sm:p-6 dark:ring-white/8"
    >
      <div>
        <h2 class="flex items-center gap-2 font-semibold">
          <ng-icon name="lucideFileKey" aria-hidden="true" />
          Certificate from an external CA
        </h2>
        <p class="text-muted-foreground mt-1 text-sm">
          The CA signs a certificate for this key. The private key remains in EUDIPLO.
        </p>
      </div>

      @if (!expanded()) {
        <button hlmBtn variant="outline" type="button" class="w-fit" (click)="expanded.set(true)">
          <ng-icon name="lucideFileKey" aria-hidden="true" />
          Request certificate from external CA
        </button>
      } @else {
        @if (key().rotationPolicy.enabled) {
          <p class="flex gap-2 rounded-xl bg-muted/50 p-3 text-sm" role="note">
            <ng-icon name="lucideAlertTriangle" class="mt-0.5 shrink-0" aria-hidden="true" />
            <span>
              This key rotates automatically. A rotation creates a new key and self-signed
              certificate, replacing this CA certificate. Turn rotation off to keep it.
              <a class="text-primary underline" [routerLink]="['/keys', key().id, 'edit']"
                >Edit rotation</a
              >
            </span>
          </p>
        }

        <section class="grid gap-3" aria-labelledby="csr-heading">
          <h3 id="csr-heading" class="font-medium">1. Create a certificate signing request</h3>
          <hlm-field class="gap-2">
            <label hlmFieldLabel for="csr-subject">Subject</label>
            <input
              hlmInput
              id="csr-subject"
              class="h-10"
              [formControl]="subject"
              [placeholder]="'CN=' + key().id"
              maxlength="1024"
              (keydown.enter)="$event.preventDefault(); createCsr()"
            />
            <p hlmFieldDescription>
              Distinguished name to certify, in certificate order (country first). Empty uses CN={{
                key().id
              }}.
            </p>
          </hlm-field>
          @if (csrError()) {
            <p class="text-destructive text-sm" role="alert">{{ csrError() }}</p>
          }
          <div class="flex flex-wrap gap-2">
            <button
              hlmBtn
              variant="outline"
              type="button"
              [attr.aria-disabled]="csrPending() || null"
              [hlmTooltip]="csrPending() ? 'Creating the CSR…' : ''"
              (click)="createCsr()"
            >
              @if (csrPending()) {
                <hlm-spinner class="size-4" aria-hidden="true" />Creating…
              } @else {
                <ng-icon name="lucideRefreshCw" aria-hidden="true" />{{
                  csr() ? 'Create new CSR' : 'Create CSR'
                }}
              }
            </button>
          </div>
          @if (csr()) {
            <hlm-field class="gap-2">
              <label hlmFieldLabel for="csr-output">CSR (PEM)</label>
              <textarea
                hlmInput
                id="csr-output"
                class="min-h-36 font-mono text-xs"
                readonly
                [value]="csr()"
              ></textarea>
              <p hlmFieldDescription>Send this signed request to your certificate authority.</p>
            </hlm-field>
            <div class="flex flex-wrap gap-2">
              <button hlmBtn variant="outline" type="button" (click)="copyCsr()">
                <ng-icon name="lucideClipboard" aria-hidden="true" />Copy CSR
              </button>
              <button hlmBtn variant="outline" type="button" (click)="downloadCsr()">
                <ng-icon name="lucideDownload" aria-hidden="true" />Download CSR
              </button>
            </div>
          }
        </section>

        <section class="grid gap-3 border-t pt-5" aria-labelledby="certificate-heading">
          <h3 id="certificate-heading" class="font-medium">2. Store the issued certificate</h3>
          @if (locked(); as reason) {
            <p class="flex gap-2 rounded-xl bg-muted/50 p-3 text-sm" role="note">
              <ng-icon name="lucideLock" class="mt-0.5 shrink-0" aria-hidden="true" />
              <span
                >{{ reason }}. Add the certificate chain to its configuration file and apply it
                again, or detach the key first.</span
              >
            </p>
          }
          <hlm-field class="gap-2">
            <label hlmFieldLabel for="issued-certificate">Certificate chain (PEM)</label>
            <textarea
              hlmInput
              id="issued-certificate"
              class="min-h-36 font-mono text-xs"
              [formControl]="certificate"
              placeholder="-----BEGIN CERTIFICATE-----"
            ></textarea>
            <p hlmFieldDescription>
              The leaf certificate first, followed by any issuing certificates.
            </p>
            <input
              #certificateFiles
              type="file"
              accept=".pem,.crt,.cer,.der,application/x-pem-file,application/pkix-cert"
              multiple
              class="sr-only"
              aria-label="Load issued certificate files"
              (change)="loadCertificateFiles($event)"
            />
          </hlm-field>
          @if (saveError()) {
            <p class="text-destructive text-sm" role="alert">{{ saveError() }}</p>
          }
          <div class="flex flex-wrap gap-2">
            <button
              hlmBtn
              variant="outline"
              type="button"
              [attr.aria-disabled]="locked() || null"
              [hlmTooltip]="locked()"
              (click)="!locked() && certificateFiles.click()"
            >
              <ng-icon name="lucideUpload" aria-hidden="true" />Load certificate files
            </button>
            <button
              hlmBtn
              type="button"
              [attr.aria-disabled]="saving() || !certificate.value.trim() || locked() || null"
              [hlmTooltip]="
                locked() ||
                (!certificate.value.trim() ? 'Paste or load the certificate chain first' : '')
              "
              (click)="saveCertificate()"
            >
              @if (saving()) {
                <hlm-spinner class="size-4" aria-hidden="true" />Storing…
              } @else {
                <ng-icon name="lucideSave" aria-hidden="true" />Store certificate
              }
            </button>
          </div>
        </section>
      }
    </section>
  `,
})
export class KeyCertificateRequest {
  readonly key = input.required<KeyChainResponseDto>();
  readonly locked = input('');
  readonly startExpanded = input(false);
  readonly certificateSaved = output<void>();
  private readonly notify = inject(NotifyService);
  private readonly confirm = inject(ConfirmService);
  private readonly csrRequest = injectMutation(() => createCsrMutation());
  private readonly update = injectMutation(() => updateKeyChainMutation());

  protected readonly subject = new FormControl('', { nonNullable: true });
  protected readonly certificate = new FormControl('', { nonNullable: true });
  protected readonly csr = signal('');
  protected readonly csrError = signal('');
  protected readonly saveError = signal('');
  protected readonly csrPending = this.csrRequest.isPending;
  protected readonly saving = this.update.isPending;
  protected readonly expanded = signal(false);
  private priorKey = '';
  private priorKid = '';

  constructor() {
    effect(() => {
      if (this.startExpanded()) this.expanded.set(true);
    });
    effect(() => {
      const current = this.key();
      const keyChanged = current.id !== this.priorKey;
      const rotated = !!this.priorKid && current.activePublicKey.kid !== this.priorKid;
      if (keyChanged) {
        this.subject.reset('');
        this.certificate.reset('');
        this.csr.set('');
        this.csrError.set('');
        this.saveError.set('');
      } else if (rotated) {
        this.csr.set('');
      }
      this.priorKey = current.id;
      this.priorKid = current.activePublicKey.kid ?? '';
    });
    this.subject.valueChanges.subscribe(() => {
      this.csr.set('');
      this.csrError.set('');
    });
  }

  protected createCsr(): void {
    if (this.csrPending()) return;
    this.csrError.set('');
    this.csrRequest.mutate(
      { id: this.key().id, subject: this.subject.value.trim() },
      {
        onSuccess: (csr) => this.csr.set(csr),
        onError: (error) =>
          this.csrError.set(getApiErrorMessage(error, 'Failed to create the CSR')),
      }
    );
  }

  protected async copyCsr(): Promise<void> {
    await copyText(this.notify, this.csr(), 'CSR');
  }

  protected downloadCsr(): void {
    const url = URL.createObjectURL(new Blob([this.csr()], { type: 'application/pkcs10' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `${this.key().id.replace(/[^A-Za-z0-9._-]/g, '_')}.csr`;
    link.click();
    URL.revokeObjectURL(url);
  }

  protected async loadCertificateFiles(event: Event): Promise<void> {
    const inputElement = event.target as HTMLInputElement;
    const files = inputElement.files;
    if (!files?.length) return;
    this.certificate.setValue(await readCertificateFiles(files));
    inputElement.value = '';
  }

  protected async saveCertificate(): Promise<void> {
    const key = this.key();
    const pem = this.certificate.value.trim();
    if (this.saving() || !pem || this.locked()) return;
    if (key.activeCertificate && !certificateIsSelfSigned(key.activeCertificate)) {
      const confirmed = await this.confirm.ask({
        title: 'Store the new certificate?',
        description: [
          `This replaces the active certificate issued by “${key.activeCertificate.issuer}”. The key stays the same, but the current certificate is no longer used.`,
          'This cannot be undone.',
        ],
        confirm: 'Store certificate',
      });
      if (!confirmed) return;
    }
    this.saveError.set('');
    this.update.mutate(
      { id: key.id, body: { activeCertificate: pem } },
      {
        onSuccess: () => {
          this.certificate.reset('');
          this.csr.set('');
          this.notify.success('Certificate stored for this key.');
          this.certificateSaved.emit();
        },
        onError: (error) =>
          this.saveError.set(getApiErrorMessage(error, 'Failed to store the certificate')),
      }
    );
  }
}
