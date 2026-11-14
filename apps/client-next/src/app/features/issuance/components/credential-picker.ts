import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import type { CredentialConfig } from '@eudiplo/sdk-core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideSearch, lucideX } from '@ng-icons/lucide';
import { HlmCheckboxImports } from '@spartan-ng/helm/checkbox';
import { HlmInputGroupImports } from '@spartan-ng/helm/input-group';
import { hasIae } from '../data/offer-request';

/**
 * The credentials an offer holds: a list of the ones the flow allows, which a search narrows by
 * ID or description, each with a checkbox. The chosen ones stay listed above the search.
 */
@Component({
  selector: 'app-credential-picker',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgIcon, HlmCheckboxImports, HlmInputGroupImports],
  providers: [provideIcons({ lucideSearch, lucideX })],
  host: { class: 'grid gap-4' },
  template: `
    @if (selected().length) {
      <ul class="flex flex-wrap gap-2" aria-label="Chosen credentials">
        @for (id of selected(); track id) {
          <li
            class="bg-primary/8 text-primary dark:bg-primary/15 inline-flex items-center gap-1 rounded-full py-1 ps-3 pe-1 text-sm font-medium"
          >
            <span class="font-mono text-[0.8125rem]">{{ id }}</span>
            <button
              type="button"
              class="hover:bg-primary/15 grid size-6 place-items-center rounded-full"
              [attr.aria-label]="'Remove ' + id"
              (click)="toggle(id, false)"
            >
              <ng-icon name="lucideX" class="text-sm" />
            </button>
          </li>
        }
      </ul>
    }

    <hlm-input-group class="h-10 rounded-lg">
      <hlm-input-group-addon>
        <ng-icon name="lucideSearch" aria-hidden="true" />
      </hlm-input-group-addon>
      <input
        hlmInputGroupInput
        id="credential-search"
        type="search"
        aria-label="Search credentials"
        placeholder="Search by ID or description"
        aria-controls="credential-options"
        [value]="search()"
        (input)="search.set($any($event.target).value)"
      />
    </hlm-input-group>

    <div
      id="credential-options"
      role="group"
      aria-label="Credentials"
      class="divide-y overflow-hidden rounded-xl border"
      [class.border-destructive]="invalid()"
    >
      @for (config of shown(); track config.id) {
        @let checked = selected().includes(config.id);
        <label
          class="hover:bg-muted/50 has-[[data-state=checked]]:bg-primary/5 flex cursor-pointer items-start gap-3 px-4 py-3 transition-colors"
          [for]="'credential-' + config.id"
        >
          <hlm-checkbox
            class="mt-0.5"
            [inputId]="'credential-' + config.id"
            [checked]="checked"
            (checkedChange)="toggle(config.id, $event)"
          />
          <span class="min-w-0">
            <span class="flex flex-wrap items-center gap-2">
              <span class="font-mono text-sm font-medium">{{ config.id }}</span>
              @if (iae(config)) {
                <span
                  class="bg-muted text-muted-foreground rounded px-1.5 py-0.5 text-[0.7rem] font-semibold"
                  >IAE</span
                >
              }
            </span>
            @if (config.description) {
              <span class="text-muted-foreground block text-sm">{{ config.description }}</span>
            }
          </span>
        </label>
      } @empty {
        <p class="text-muted-foreground px-4 py-6 text-center text-sm">
          No credential matches “{{ search() }}”.
        </p>
      }
    </div>
  `,
})
export class CredentialPicker {
  /** The credentials the flow allows. */
  readonly configs = input.required<readonly CredentialConfig[]>();
  readonly selected = input.required<readonly string[]>();
  /** Whether the picker shows that a choice is missing. */
  readonly invalid = input(false);
  readonly selectedChange = output<string[]>();

  protected readonly search = signal('');

  /** The credentials whose ID or description holds the search, in any case. */
  protected readonly shown = computed(() => {
    const term = this.search().trim().toLowerCase();
    return this.configs().filter(
      (config) =>
        !term ||
        config.id.toLowerCase().includes(term) ||
        !!config.description?.toLowerCase().includes(term)
    );
  });

  protected iae(config: CredentialConfig): boolean {
    return hasIae(config);
  }

  protected toggle(id: string, checked: boolean): void {
    const others = this.selected().filter((entry) => entry !== id);
    this.selectedChange.emit(checked ? [...others, id] : others);
  }
}
