import { inject, Injectable, signal } from '@angular/core';
import { injectMutation, QueryClient } from '@tanstack/angular-query-experimental';
import { CallerService } from '../../../core/auth/caller.service';
import { SessionService } from '../../../core/auth/session.service';
import { getApiErrorMessage } from '../../../core/errors/error-message';
import { NotifyService } from '../../../core/notify/notify.service';
import { ConfirmService } from '../../../shared/dialogs/confirm';
import { deleteUserMutation, type User, usersKey } from './user-queries';

/** Why the caller cannot change a person whose roles it neither holds nor may grant. */
export const USER_ROLE_LOCK = 'This person has roles you neither hold nor may grant.';

/** Deletes a person after asking, for the list and the detail page. */
@Injectable()
export class UserActions {
  private readonly instance = inject(SessionService).getBaseUrl();
  private readonly caller = inject(CallerService).loadedCaller;
  private readonly notify = inject(NotifyService);
  private readonly confirm = inject(ConfirmService);
  private readonly queryClient = inject(QueryClient);
  private readonly remove = injectMutation(() => deleteUserMutation());

  /** The person whose deletion runs. */
  readonly busy = signal<string | null>(null);

  /** Deletes `user` after asking; resolves true once deleted. */
  async delete(user: User): Promise<boolean> {
    if (this.busy()) return false;
    const confirmed = await this.confirm.ask({
      title: `Delete ${user.username}?`,
      description:
        'The person can no longer sign in to this tenant, and the identity provider removes their account. This cannot be undone.',
      confirm: 'Delete person',
      destructive: true,
    });
    if (!confirmed) return false;
    this.busy.set(user.id);
    try {
      await this.remove.mutateAsync(user.id);
    } catch (error) {
      this.notify.error(getApiErrorMessage(error, 'Failed to delete the person'));
      return false;
    } finally {
      this.busy.set(null);
    }
    this.notify.success(`${user.username} deleted.`);
    void this.queryClient.invalidateQueries({
      queryKey: usersKey(this.instance, this.caller()?.tenantId),
    });
    return true;
  }
}
