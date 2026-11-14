import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideTriangleAlert } from '@ng-icons/lucide';
import { HlmCheckboxImports } from '@spartan-ng/helm/checkbox';
import { ROLE_DESCRIPTIONS, ROLE_GROUPS } from '../../../core/auth/role-descriptions';
import type { Role } from '../../../core/auth/role-grants';

/** The role every admin client of a tenant gets, whatever else it is given. */
export const ALWAYS_GRANTED: Role = 'clients:manage';

/** Common sets of roles for an admin client, on top of `clients:manage`. */
const ROLE_PRESETS: readonly { readonly label: string; readonly roles: readonly Role[] }[] = [
  { label: 'Clients only', roles: [] },
  {
    label: 'Issuer',
    roles: ['issuance:offer', 'issuance:manage', 'credentials:status', 'sessions:read'],
  },
  { label: 'Verifier', roles: ['presentation:request', 'presentation:manage', 'sessions:read'] },
  {
    label: 'Whole tenant',
    roles: ROLE_GROUPS.flatMap((group) => group.roles).filter(
      (role) => role !== 'tenants:manage' && role !== ALWAYS_GRANTED
    ),
  },
];

function sameRoles(a: readonly Role[], b: readonly Role[]): boolean {
  return a.length === b.length && a.every((role) => b.includes(role));
}

/**
 * The roles of a tenant's admin client: by group, with sets for the common cases. The client
 * always gets `clients:manage`, as the backend gives it, so that role stays selected.
 */
@Component({
  selector: 'app-role-picker',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgIcon, HlmCheckboxImports],
  providers: [provideIcons({ lucideTriangleAlert })],
  host: { class: '@container block' },
  template: `
    <div class="flex flex-wrap items-center gap-2" role="group" aria-label="Choose a set of roles">
      <span class="text-muted-foreground me-1 text-sm">Start from</span>
      @for (preset of presets; track preset.label) {
        <button
          type="button"
          class="text-muted-foreground hover:text-foreground hover:bg-muted aria-pressed:border-primary/40 aria-pressed:bg-primary/8 aria-pressed:text-primary h-8 rounded-full border px-3 text-sm font-medium transition-colors"
          [attr.aria-pressed]="isPreset(preset.roles)"
          (click)="choose(preset.roles)"
        >
          {{ preset.label }}
        </button>
      }
    </div>

    <div class="mt-5 grid gap-x-8 gap-y-5 @2xl:grid-cols-2">
      @for (group of groups; track group.label) {
        <fieldset class="min-w-0">
          <legend class="text-muted-foreground mb-1.5 text-xs font-medium">
            {{ group.label }}
          </legend>
          <div class="grid gap-0.5">
            @for (role of group.roles; track role) {
              @let locked = role === alwaysGranted;
              <label
                class="has-[[data-state=checked]]:bg-primary/5 flex items-start gap-3 rounded-lg px-2.5 py-2 transition-colors"
                [class.cursor-pointer]="!locked"
                [class.hover:bg-muted/60]="!locked"
                [for]="'role-' + role"
              >
                <hlm-checkbox
                  class="mt-0.5"
                  [inputId]="'role-' + role"
                  [checked]="locked || selected().includes(role)"
                  [disabled]="locked"
                  [aria-describedby]="'role-' + role + '-hint'"
                  (checkedChange)="toggle(role, $event)"
                />
                <span class="min-w-0">
                  <span class="flex flex-wrap items-baseline gap-x-2">
                    <span class="font-mono text-[0.8125rem] font-medium">{{ role }}</span>
                    @if (locked) {
                      <span class="text-muted-foreground text-xs">always included</span>
                    }
                  </span>
                  <span
                    class="text-muted-foreground block text-xs leading-snug"
                    [id]="'role-' + role + '-hint'"
                    >{{ descriptions[role] }}</span
                  >
                </span>
              </label>
            }
          </div>
        </fieldset>
      }
    </div>

    @if (selected().includes('tenants:manage')) {
      <p
        class="border-warning/30 bg-warning/8 mt-4 flex gap-2.5 rounded-lg border px-3 py-2.5 text-sm"
        role="status"
      >
        <ng-icon
          name="lucideTriangleAlert"
          class="text-warning mt-0.5 shrink-0"
          aria-hidden="true"
        />
        <span>
          With tenants:manage this client can create, change and delete every tenant of the
          instance, not only this one.
        </span>
      </p>
    }
  `,
})
export class RolePicker {
  /** The chosen roles, with `clients:manage`. */
  readonly selected = input.required<readonly Role[]>();
  readonly selectedChange = output<Role[]>();

  protected readonly groups = ROLE_GROUPS;
  protected readonly presets = ROLE_PRESETS;
  protected readonly descriptions = ROLE_DESCRIPTIONS;
  protected readonly alwaysGranted = ALWAYS_GRANTED;

  /** The chosen roles besides the one every admin client gets. */
  private readonly extra = computed(() =>
    this.selected().filter((role) => role !== ALWAYS_GRANTED)
  );

  protected isPreset(roles: readonly Role[]): boolean {
    return sameRoles(this.extra(), roles);
  }

  protected choose(roles: readonly Role[]): void {
    this.selectedChange.emit([ALWAYS_GRANTED, ...roles]);
  }

  protected toggle(role: Role, checked: boolean): void {
    if (role === ALWAYS_GRANTED) return;
    const others = this.extra().filter((entry) => entry !== role);
    this.selectedChange.emit([ALWAYS_GRANTED, ...(checked ? [...others, role] : others)]);
  }
}
