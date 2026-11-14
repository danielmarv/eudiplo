import { ChangeDetectionStrategy, Component, input, output, signal } from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideEye, lucideEyeOff, lucideKeyRound, lucideShieldOff } from '@ng-icons/lucide';
import { HlmFieldImports } from '@spartan-ng/helm/field';
import { HlmInputImports } from '@spartan-ng/helm/input';
import { HlmTextareaImports } from '@spartan-ng/helm/textarea';
import type { EndpointForm } from './endpoint-form';

const CARD =
  'bg-card rounded-2xl p-5 shadow-[0_1px_2px_rgba(16,24,64,0.04),0_16px_36px_-24px_rgba(27,33,96,0.35)] ring-1 ring-black/5 sm:p-6 dark:ring-white/8';

/**
 * The fields of an endpoint the backend calls: what it is and where, and how it authenticates.
 * When editing, the ID is fixed and a stored key stays hidden: left empty, it is kept.
 */
@Component({
  selector: 'app-endpoint-fields',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, NgIcon, HlmFieldImports, HlmInputImports, HlmTextareaImports],
  providers: [provideIcons({ lucideEye, lucideEyeOff, lucideKeyRound, lucideShieldOff })],
  host: { class: 'grid gap-6' },
  template: `
    <section [class]="card" [formGroup]="form()" aria-labelledby="endpoint-heading">
      <h2 id="endpoint-heading" class="font-semibold">Endpoint</h2>
      <p class="text-muted-foreground mt-1 mb-5 text-sm">{{ urlHint() }}</p>
      <div class="grid gap-x-6 gap-y-5 md:grid-cols-2">
        <hlm-field class="content-start gap-2">
          <label hlmFieldLabel for="endpoint-name">Name</label>
          <input
            hlmInput
            id="endpoint-name"
            class="h-10"
            formControlName="name"
            autocomplete="off"
            [placeholder]="namePlaceholder()"
            (input)="nameInput.emit()"
          />
          <hlm-field-error validator="required">Enter a name.</hlm-field-error>
        </hlm-field>

        <hlm-field class="content-start gap-2">
          <label hlmFieldLabel for="endpoint-id">ID</label>
          <input
            hlmInput
            id="endpoint-id"
            class="read-only:bg-muted/50 read-only:text-muted-foreground h-10 font-mono text-sm"
            formControlName="id"
            autocomplete="off"
            spellcheck="false"
            [readonly]="editing()"
            (input)="idInput.emit()"
          />
          <p hlmFieldDescription>
            @if (editing()) {
              Fixed once created.
            } @else {
              How credential types and offers refer to it. Follows the name until you change it.
            }
          </p>
          <hlm-field-error validator="required">Enter an ID.</hlm-field-error>
        </hlm-field>

        <hlm-field class="content-start gap-2 md:col-span-2">
          <label hlmFieldLabel for="endpoint-url">URL</label>
          <input
            hlmInput
            id="endpoint-url"
            class="h-10 font-mono text-sm"
            type="url"
            inputmode="url"
            formControlName="url"
            autocomplete="off"
            spellcheck="false"
            placeholder="https://backend.example.com/claims"
          />
          <hlm-field-error validator="required">Enter the URL.</hlm-field-error>
          <hlm-field-error validator="url">Enter an http or https URL.</hlm-field-error>
        </hlm-field>

        <hlm-field class="content-start gap-2 md:col-span-2">
          <label hlmFieldLabel for="endpoint-description">Description</label>
          <textarea
            hlmTextarea
            id="endpoint-description"
            class="min-h-20"
            formControlName="description"
            placeholder="Optional"
          ></textarea>
        </hlm-field>
      </div>
    </section>

    <section [class]="card" [formGroup]="form()" aria-labelledby="auth-heading">
      <h2 id="auth-heading" class="font-semibold">Authentication</h2>
      <p class="text-muted-foreground mt-1 mb-5 text-sm">
        How EUDIPLO proves itself to the endpoint.
      </p>
      <div class="grid gap-3 sm:grid-cols-2" role="radiogroup" aria-labelledby="auth-heading">
        @for (option of authOptions; track option.value) {
          <label
            class="has-checked:border-primary has-checked:bg-primary/5 has-focus-visible:ring-ring/50 flex cursor-pointer items-start gap-3 rounded-xl border p-4 has-focus-visible:ring-3"
          >
            <input
              type="radio"
              class="accent-primary mt-1"
              formControlName="authType"
              [value]="option.value"
            />
            <span>
              <span class="flex items-center gap-2 text-sm font-medium">
                <ng-icon [name]="option.icon" class="text-muted-foreground" aria-hidden="true" />
                {{ option.label }}
              </span>
              <span class="text-muted-foreground mt-0.5 block text-sm">{{ option.detail }}</span>
            </span>
          </label>
        }
      </div>

      @if (form().controls.authType.value === 'apiKey') {
        <div class="mt-5 grid gap-x-6 gap-y-5 md:grid-cols-2">
          <hlm-field class="content-start gap-2">
            <label hlmFieldLabel for="endpoint-header">Header</label>
            <input
              hlmInput
              id="endpoint-header"
              class="h-10 font-mono text-sm"
              formControlName="headerName"
              autocomplete="off"
              spellcheck="false"
            />
            <hlm-field-error validator="required">Enter the header name.</hlm-field-error>
          </hlm-field>

          <hlm-field class="content-start gap-2">
            <label hlmFieldLabel for="endpoint-key">Key</label>
            <div class="relative">
              <input
                hlmInput
                id="endpoint-key"
                class="h-10 w-full pe-10 font-mono text-sm"
                formControlName="key"
                autocomplete="new-password"
                spellcheck="false"
                [type]="showKey() ? 'text' : 'password'"
                [placeholder]="form().keyContext.storedKeyUrl ? 'Stored key, hidden' : ''"
              />
              <button
                type="button"
                class="text-muted-foreground hover:text-foreground absolute inset-y-0 end-0 grid w-10 place-items-center"
                [attr.aria-label]="showKey() ? 'Hide the key' : 'Show the key'"
                [attr.aria-pressed]="showKey()"
                (click)="showKey.set(!showKey())"
              >
                <ng-icon [name]="showKey() ? 'lucideEyeOff' : 'lucideEye'" />
              </button>
            </div>
            @if (form().keyContext.storedKeyUrl) {
              <p hlmFieldDescription>
                A key is stored. Leave this empty to keep it, or enter a new one.
              </p>
            }
            <hlm-field-error validator="required">Enter the key.</hlm-field-error>
            <hlm-field-error validator="newUrl">
              Enter the key again: the stored key is only kept for the same URL.
            </hlm-field-error>
          </hlm-field>
        </div>
      }
    </section>
  `,
})
export class EndpointFields {
  readonly form = input.required<EndpointForm>();
  readonly editing = input(false);
  /** What the endpoint receives, under the Endpoint heading. */
  readonly urlHint = input('');
  readonly namePlaceholder = input('');
  /** The user typed in the name or the ID, so the page can keep the ID following the name. */
  readonly nameInput = output<void>();
  readonly idInput = output<void>();

  protected readonly card = CARD;
  protected readonly showKey = signal(false);
  protected readonly authOptions = [
    {
      value: 'none',
      label: 'None',
      icon: 'lucideShieldOff',
      detail: 'For an endpoint that checks callers some other way, such as on its network.',
    },
    {
      value: 'apiKey',
      label: 'API key',
      icon: 'lucideKeyRound',
      detail: 'EUDIPLO sends a key in a header with every request.',
    },
  ] as const;
}
