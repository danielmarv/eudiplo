import { ChangeDetectionStrategy, Component, input, output, signal } from '@angular/core';
import { FormlyForm } from '@ngx-formly/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideCloudDownload,
  lucideFileJson,
  lucideIdCard,
  lucideWandSparkles,
} from '@ng-icons/lucide';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import { HlmDialogImports } from '@spartan-ng/helm/dialog';
import { HlmTextareaImports } from '@spartan-ng/helm/textarea';
import type { ClaimForm, ClaimSourceKind } from '../data/claim-form';

/**
 * The claims of one credential of a pre-authorized offer: typed into the form built from the
 * credential's schema, or resolved by the attribute provider the credential names. The form can
 * be filled with the credential's default values, or from JSON.
 */
@Component({
  selector: 'app-claims-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgIcon, FormlyForm, HlmButtonImports, HlmDialogImports, HlmTextareaImports],
  providers: [
    provideIcons({ lucideCloudDownload, lucideFileJson, lucideIdCard, lucideWandSparkles }),
  ],
  host: {
    class:
      'bg-card block rounded-2xl p-5 shadow-[0_1px_2px_rgba(16,24,64,0.04),0_16px_36px_-24px_rgba(27,33,96,0.35)] ring-1 ring-black/5 sm:p-6 dark:ring-white/8',
    role: 'group',
    '[attr.aria-labelledby]': "'claims-' + claimForm().id",
  },
  template: `
    @let form = claimForm();
    <div class="flex items-start gap-3">
      <span
        class="bg-accent text-accent-foreground grid size-10 shrink-0 place-items-center rounded-xl"
        aria-hidden="true"
      >
        <ng-icon name="lucideIdCard" class="text-lg" />
      </span>
      <div class="min-w-0">
        <h3 [id]="'claims-' + form.id" class="font-mono text-sm font-semibold break-all">
          {{ form.id }}
        </h3>
        @if (form.config.description) {
          <p class="text-muted-foreground text-sm">{{ form.config.description }}</p>
        }
      </div>
    </div>

    <fieldset class="mt-5">
      <legend class="text-sm font-medium">Where its claims come from</legend>
      <div class="mt-2 flex flex-wrap gap-2">
        @for (option of sources; track option.value) {
          @let disabled = option.value === 'attributeProvider' && !form.configuredProviderId;
          <label
            class="has-checked:border-primary/50 has-checked:bg-primary/5 has-focus-visible:ring-ring/50 flex items-center gap-2.5 rounded-lg border px-3 py-2 text-sm has-focus-visible:ring-3"
            [class.cursor-pointer]="!disabled"
            [class.opacity-50]="disabled"
          >
            <input
              type="radio"
              class="accent-primary size-4"
              [name]="'source-' + form.id"
              [value]="option.value"
              [checked]="form.source() === option.value"
              [disabled]="disabled"
              (change)="sourceChange.emit(option.value)"
            />
            {{ option.label }}
          </label>
        }
      </div>
      @if (!form.configuredProviderId) {
        <p class="text-muted-foreground mt-2 text-sm">
          The credential names no attribute provider, so its claims are typed in.
        </p>
      }
    </fieldset>

    @if (form.source() === 'attributeProvider') {
      <p class="bg-muted/60 mt-5 flex gap-2.5 rounded-xl px-4 py-3 text-sm">
        <ng-icon name="lucideCloudDownload" class="mt-0.5 shrink-0" aria-hidden="true" />
        <span>
          The attribute provider
          <span class="font-mono text-[0.8125rem]">{{ form.configuredProviderId }}</span>
          resolves the claims during issuance.
        </span>
      </p>
    } @else {
      <div class="mt-5">
        @if (form.fields.length) {
          <formly-form
            [form]="form.form"
            [fields]="form.fields"
            [model]="form.model()"
            [options]="form.options"
          />
        } @else {
          <p class="text-muted-foreground text-sm">The credential defines no claims to fill in.</p>
        }
        <div class="mt-5 flex flex-wrap gap-2">
          @if (form.defaults) {
            <button hlmBtn variant="outline" size="sm" type="button" (click)="useDefaults()">
              <ng-icon name="lucideWandSparkles" aria-hidden="true" />
              Fill in the default values
            </button>
          }
          <button hlmBtn variant="ghost" size="sm" type="button" (click)="openImport()">
            <ng-icon name="lucideFileJson" aria-hidden="true" />
            Import claims from JSON
          </button>
        </div>
      </div>
    }

    <hlm-dialog [state]="importing() ? 'open' : 'closed'" (stateChanged)="onImportState($event)">
      <hlm-dialog-content *hlmDialogPortal="let ctx" class="sm:max-w-2xl">
        <hlm-dialog-header>
          <h2 hlmDialogTitle>Import claims of {{ form.id }}</h2>
          <p hlmDialogDescription>
            Paste the claims as a JSON object. They replace what the form holds.
          </p>
        </hlm-dialog-header>
        <label class="sr-only" [for]="'import-' + form.id">Claims as JSON</label>
        <textarea
          hlmTextarea
          class="min-h-64 font-mono text-[0.8125rem]"
          spellcheck="false"
          [id]="'import-' + form.id"
          [value]="json()"
          [attr.aria-invalid]="!!importError() || null"
          [attr.aria-describedby]="importError() ? 'import-error-' + form.id : null"
          (input)="json.set($any($event.target).value); importError.set('')"
        ></textarea>
        @if (importError()) {
          <p [id]="'import-error-' + form.id" class="text-destructive text-sm" role="alert">
            {{ importError() }}
          </p>
        }
        <hlm-dialog-footer>
          <button hlmBtn variant="ghost" type="button" (click)="importing.set(false)">
            Cancel
          </button>
          <button hlmBtn type="button" (click)="applyImport()">Use these claims</button>
        </hlm-dialog-footer>
      </hlm-dialog-content>
    </hlm-dialog>
  `,
})
export class ClaimsCard {
  readonly claimForm = input.required<ClaimForm>();
  readonly sourceChange = output<ClaimSourceKind>();

  protected readonly sources: readonly { value: ClaimSourceKind; label: string }[] = [
    { value: 'form', label: 'Typed into the form' },
    { value: 'attributeProvider', label: 'From the attribute provider' },
  ];

  protected readonly importing = signal(false);
  protected readonly json = signal('');
  protected readonly importError = signal('');

  protected useDefaults(): void {
    const form = this.claimForm();
    if (form.defaults) form.model.set(structuredClone(form.defaults));
    form.form.markAsDirty();
  }

  protected openImport(): void {
    this.json.set(JSON.stringify(this.claimForm().form.value ?? {}, null, 2));
    this.importError.set('');
    this.importing.set(true);
  }

  protected onImportState(state: string): void {
    if (state === 'closed') this.importing.set(false);
  }

  protected applyImport(): void {
    let value: unknown;
    try {
      value = JSON.parse(this.json());
    } catch {
      this.importError.set('This is not valid JSON.');
      return;
    }
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      this.importError.set('Paste a JSON object, with a property per claim.');
      return;
    }
    const form = this.claimForm();
    form.model.set(value as Record<string, unknown>);
    form.form.markAsDirty();
    this.importing.set(false);
  }
}
