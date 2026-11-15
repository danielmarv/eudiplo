import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideLock } from '@ng-icons/lucide';
import { HlmCheckboxImports } from '@spartan-ng/helm/checkbox';
import { ROLE_DESCRIPTIONS, ROLE_GROUPS } from '../../core/auth/role-descriptions';
import { grantHint, type Role, roleChoices } from '../../core/auth/role-grants';

/**
 * The roles of an API client or a person, by group, as checkboxes: the roles the caller may
 * grant, and the other roles the edited one has, which stay as they are and are marked as locked
 * when the caller does not hold them. Says what the caller can grant and, once `invalid`, that a
 * role is missing.
 */
@Component({
  selector: 'app-role-choices',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgIcon, HlmCheckboxImports],
  providers: [provideIcons({ lucideLock })],
  host: { class: 'block' },
  template: `
    <fieldset class="min-w-0" [attr.aria-describedby]="idPrefix() + '-hint'">
      <legend class="font-semibold">Roles</legend>
      <p [id]="idPrefix() + '-hint'" class="text-muted-foreground mt-1 text-sm">
        {{ hint() }}
        <a
          class="text-primary font-medium hover:underline"
          href="https://docs.eudiplo.dev/reference/roles"
          target="_blank"
          rel="noopener"
          >About the roles</a
        >
      </p>
      <div class="@container mt-4">
        <div class="grid gap-x-8 gap-y-5 @2xl:grid-cols-2">
          @for (group of groups(); track group.label) {
            <fieldset class="min-w-0">
              <legend class="text-muted-foreground mb-1.5 text-xs font-medium">
                {{ group.label }}
              </legend>
              <div class="grid gap-0.5">
                @for (option of group.roles; track option.role) {
                  @let id = idPrefix() + '-' + option.role;
                  <label
                    class="has-[[data-state=checked]]:bg-primary/5 flex items-start gap-3 rounded-lg px-2.5 py-2"
                    [class.cursor-pointer]="!option.locked && !disabled()"
                    [class.hover:bg-muted/60]="!option.locked && !disabled()"
                    [for]="id"
                  >
                    <hlm-checkbox
                      class="mt-0.5"
                      [inputId]="id"
                      [checked]="selected().includes(option.role)"
                      [disabled]="option.locked || disabled()"
                      [attr.aria-invalid]="invalid() || null"
                      [aria-describedby]="id + '-hint'"
                      (checkedChange)="toggle(option.role, $event === true)"
                    />
                    <span class="min-w-0">
                      <span class="flex flex-wrap items-baseline gap-x-2">
                        <span class="font-mono text-[0.8125rem] font-medium">{{
                          option.role
                        }}</span>
                        @if (option.locked) {
                          <span
                            class="text-muted-foreground inline-flex items-center gap-1 text-xs"
                          >
                            <ng-icon name="lucideLock" aria-hidden="true" />
                            you cannot change it
                          </span>
                        }
                      </span>
                      <span
                        class="text-muted-foreground block text-xs leading-snug"
                        [id]="id + '-hint'"
                        >{{ descriptions[option.role] }}</span
                      >
                    </span>
                  </label>
                }
              </div>
            </fieldset>
          }
        </div>
      </div>
      @if (invalid()) {
        <p class="text-destructive mt-3 text-sm">Choose at least one role.</p>
      }
    </fieldset>
  `,
})
export class RoleChoices {
  /** The roles of the signed-in caller, which decide what it may grant. */
  readonly callerRoles = input.required<readonly string[]>();
  /** The stored roles of the edited client or person; none for a new one. */
  readonly storedRoles = input<readonly string[]>([]);
  readonly selected = input.required<readonly string[]>();
  readonly disabled = input(false);
  readonly invalid = input(false);
  /** Starts the IDs of the checkboxes, so that they are unique on the page. */
  readonly idPrefix = input('role');
  readonly selectedChange = output<string[]>();

  protected readonly descriptions = ROLE_DESCRIPTIONS;

  protected readonly groups = computed(() => {
    const options = roleChoices([...this.callerRoles()], [...this.storedRoles()]).options;
    const locked = new Map(options.map((option) => [option.role, option.locked]));
    return ROLE_GROUPS.map((group) => ({
      label: group.label,
      roles: group.roles
        .filter((role) => locked.has(role))
        .map((role) => ({ role, locked: locked.get(role)! })),
    })).filter((group) => group.roles.length);
  });

  protected readonly hint = computed(() => grantHint([...this.callerRoles()]));

  protected toggle(role: Role, checked: boolean): void {
    const rest = this.selected().filter((value) => value !== role);
    this.selectedChange.emit(checked ? [...rest, role] : rest);
  }
}
