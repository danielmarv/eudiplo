import {
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
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import type { CreateUserDto } from '@eudiplo/sdk-core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideShieldAlert, lucideTriangleAlert } from '@ng-icons/lucide';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import { HlmCheckboxImports } from '@spartan-ng/helm/checkbox';
import { HlmFieldImports } from '@spartan-ng/helm/field';
import { HlmInputImports } from '@spartan-ng/helm/input';
import { HlmSkeletonImports } from '@spartan-ng/helm/skeleton';
import { HlmSpinnerImports } from '@spartan-ng/helm/spinner';
import { injectMutation, injectQuery, QueryClient } from '@tanstack/angular-query-experimental';
import { map, merge, startWith } from 'rxjs';
import { CallerService } from '../../../core/auth/caller.service';
import { roleChoices } from '../../../core/auth/role-grants';
import { SessionService } from '../../../core/auth/session.service';
import { getApiErrorMessage } from '../../../core/errors/error-message';
import { NotifyService } from '../../../core/notify/notify.service';
import { firstFieldWithError, showFieldsToFix } from '../../../shared/forms/field-to-fix';
import { PageHeader } from '../../../shared/pages/page-header';
import { RoleChoices } from '../../../shared/roles/role-choices';
import {
  type TemporaryLogin,
  TemporaryPasswordDialog,
} from '../components/temporary-password-dialog';
import { createUserMutation, updateUserMutation, userQuery, usersKey } from '../data/user-queries';

type Roles = CreateUserDto['roles'];

/**
 * Adds a person (`/users/create`) or changes one (`/users/:id/edit`): username, whether they can
 * sign in, and their roles. The caller can grant only the roles its own roles allow; other roles
 * stay as they are. A new person's temporary password is shown once.
 */
@Component({
  selector: 'app-user-form',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    RouterLink,
    NgIcon,
    HlmButtonImports,
    HlmCheckboxImports,
    HlmFieldImports,
    HlmInputImports,
    HlmSkeletonImports,
    HlmSpinnerImports,
    PageHeader,
    RoleChoices,
    TemporaryPasswordDialog,
  ],
  providers: [provideIcons({ lucideShieldAlert, lucideTriangleAlert })],
  templateUrl: './user-form.html',
})
export class UserForm {
  /** The person to edit, from the route; none to add one. */
  readonly id = input<string>();

  private readonly instance = inject(SessionService).getBaseUrl();
  private readonly caller = inject(CallerService).loadedCaller;
  private readonly tenant = computed(() => this.caller()?.tenantId);
  protected readonly callerRoles = computed(() => this.caller()?.roles ?? []);
  private readonly router = inject(Router);
  private readonly notify = inject(NotifyService);
  private readonly queryClient = inject(QueryClient);
  private readonly injector = inject(Injector);
  private readonly destroyRef = inject(DestroyRef);
  private readonly formElement = viewChild<ElementRef<HTMLFormElement>>('formElement');

  protected readonly editing = computed(() => !!this.id());
  protected readonly user = injectQuery(() => ({
    ...userQuery(this.instance, this.tenant(), this.id() ?? ''),
    enabled: !!this.instance && !!this.id(),
  }));
  private readonly create = injectMutation(() => createUserMutation());
  private readonly update = injectMutation(() => updateUserMutation());
  protected readonly saving = computed(() => this.create.isPending() || this.update.isPending());
  protected readonly created = signal<TemporaryLogin | null>(null);

  protected readonly form = new FormGroup({
    username: new FormControl('', { nonNullable: true, validators: Validators.required }),
    enabled: new FormControl(true, { nonNullable: true }),
    roles: new FormControl<string[]>([], { nonNullable: true, validators: Validators.required }),
  });
  private readonly value = toSignal(
    merge(this.form.valueChanges, this.form.statusChanges).pipe(
      startWith(null),
      map(() => this.form.getRawValue())
    ),
    { requireSync: true }
  );
  protected readonly selectedRoles = computed(() => this.value().roles);

  /** The stored person's roles the caller neither holds nor may grant. */
  protected readonly unmanageable = computed(
    () => roleChoices(this.callerRoles(), this.user.data()?.roles ?? []).unmanageable
  );
  protected readonly locked = computed(() =>
    this.unmanageable().length
      ? 'You cannot change this person: they have roles you neither hold nor may grant.'
      : ''
  );

  constructor() {
    let filled = false;
    effect(() => {
      const user = this.user.data();
      if (!user || filled) return;
      filled = true;
      untracked(() => {
        this.form.reset({ username: user.username, enabled: user.enabled, roles: [...user.roles] });
        this.form.controls.username.disable();
      });
    });
    effect(() => {
      const disabled = !!this.locked() || (this.editing() && !this.user.isSuccess());
      untracked(() => {
        if (disabled && this.form.enabled) this.form.disable({ emitEvent: false });
        if (!disabled && this.form.disabled) {
          this.form.enable({ emitEvent: false });
          if (this.editing()) this.form.controls.username.disable({ emitEvent: false });
        }
      });
    });
  }

  protected setRoles(roles: string[]): void {
    const control = this.form.controls.roles;
    control.markAsDirty();
    control.markAsTouched();
    control.setValue(roles);
  }

  protected save(): void {
    if (this.saving() || this.locked()) return;
    if (this.form.invalid) {
      const container = () => this.formElement()?.nativeElement;
      showFieldsToFix(this.form, {
        notify: this.notify,
        injector: this.injector,
        container,
        field: () => firstFieldWithError(container()),
      });
      return;
    }
    const raw = this.form.getRawValue();
    const roles = raw.roles as Roles;
    const id = this.id();
    if (id) {
      this.update.mutate(
        { id, body: { enabled: raw.enabled, roles } },
        {
          onSuccess: () => {
            this.notify.success(`${raw.username} saved.`);
            this.invalidate();
            this.leave(id);
          },
          onError: (error) =>
            this.notify.error(getApiErrorMessage(error, 'Failed to save the person')),
        }
      );
      return;
    }
    const username = raw.username.trim();
    this.create.mutate(
      { username, enabled: raw.enabled, roles },
      {
        onSuccess: (created) => {
          this.invalidate();
          if (created.temporaryPassword) {
            this.created.set({
              username: created.username || username,
              temporaryPassword: created.temporaryPassword,
            });
            this.createdId = created.id;
            return;
          }
          this.notify.success(`${username} added.`);
          this.leave(created.id);
        },
        onError: (error) =>
          this.notify.error(getApiErrorMessage(error, 'Failed to add the person')),
      }
    );
  }

  private createdId = '';

  protected onPasswordSaved(): void {
    this.created.set(null);
    this.leave(this.createdId);
  }

  private leave(id: string | undefined): void {
    if (this.destroyRef.destroyed) return;
    void this.router.navigate(id ? ['/users', id] : ['/users']);
  }

  private invalidate(): void {
    void this.queryClient.invalidateQueries({ queryKey: usersKey(this.instance, this.tenant()) });
  }

  protected errorMessage(error: unknown): string {
    return getApiErrorMessage(error, 'Failed to load the person');
  }
}
