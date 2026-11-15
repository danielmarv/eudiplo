import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideArrowLeft,
  lucideLock,
  lucidePencil,
  lucideShieldAlert,
  lucideTrash2,
  lucideTriangleAlert,
} from '@ng-icons/lucide';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import { HlmSkeletonImports } from '@spartan-ng/helm/skeleton';
import { HlmTooltipImports } from '@spartan-ng/helm/tooltip';
import { injectQuery } from '@tanstack/angular-query-experimental';
import { CallerService } from '../../../core/auth/caller.service';
import { ROLE_DESCRIPTIONS, ROLE_GROUPS } from '../../../core/auth/role-descriptions';
import { type Role, roleChoices } from '../../../core/auth/role-grants';
import { SessionService } from '../../../core/auth/session.service';
import { getApiErrorMessage, hasHttpStatus } from '../../../core/errors/error-message';
import { PageHeader } from '../../../shared/pages/page-header';
import { USER_ROLE_LOCK, UserActions } from '../data/user-actions';
import { type User, userQuery } from '../data/user-queries';

/**
 * One person (`/users/:id`): whether they can sign in, and their roles by group. They can be
 * edited or deleted, unless they have roles the caller neither holds nor may grant.
 */
@Component({
  selector: 'app-user-detail',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    NgIcon,
    HlmButtonImports,
    HlmSkeletonImports,
    HlmTooltipImports,
    PageHeader,
  ],
  providers: [
    UserActions,
    provideIcons({
      lucideArrowLeft,
      lucideLock,
      lucidePencil,
      lucideShieldAlert,
      lucideTrash2,
      lucideTriangleAlert,
    }),
  ],
  templateUrl: './user-detail.html',
})
export class UserDetail {
  /** The person's ID, from the route. */
  readonly id = input.required<string>();

  private readonly instance = inject(SessionService).getBaseUrl();
  private readonly caller = inject(CallerService).loadedCaller;
  private readonly tenant = computed(() => this.caller()?.tenantId);
  private readonly router = inject(Router);
  protected readonly actions = inject(UserActions);

  protected readonly user = injectQuery(() => userQuery(this.instance, this.tenant(), this.id()));

  /** The person's roles the caller neither holds nor may grant. */
  protected readonly unmanageable = computed(
    () => roleChoices(this.caller()?.roles ?? [], this.user.data()?.roles ?? []).unmanageable
  );
  protected readonly locked = computed(() => (this.unmanageable().length ? USER_ROLE_LOCK : ''));

  protected readonly roleGroups = computed(() => {
    const held = new Set<string>(this.user.data()?.roles ?? []);
    return ROLE_GROUPS.map((group) => ({
      label: group.label,
      roles: group.roles.filter((role) => held.has(role)),
    })).filter((group) => group.roles.length);
  });
  protected readonly descriptions: Record<Role, string> = ROLE_DESCRIPTIONS;

  protected async delete(user: User): Promise<void> {
    if (await this.actions.delete(user)) void this.router.navigate(['/users']);
  }

  protected notFound(error: unknown): boolean {
    return hasHttpStatus(error, 404);
  }

  protected errorMessage(error: unknown): string {
    return getApiErrorMessage(error, 'Failed to load the person');
  }
}
