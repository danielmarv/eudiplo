import { inject } from '@angular/core';
import { type CanActivateFn, Router } from '@angular/router';
import { NotifyService } from '../notify/notify.service';
import { CallerService } from './caller.service';
import type { Role } from './role-grants';
import { SessionService } from './session.service';

/**
 * Opens a page only with a valid session, and waits for the caller of the current token,
 * so pages and menus see the roles and tenant the backend resolved from it. Without a
 * caller, loading it failed and a notice offers to try again; the page still opens, so the
 * shell keeps its Logout. Pages that need a role also use {@link requireRole}.
 *
 * Without a session the login page opens. A kept session resumes there, and signing in again
 * as the client of an ended session returns to this page.
 */
export const authGuard: CanActivateFn = async (_route, state) => {
  const session = inject(SessionService);
  if (session.getAuthenticationStatus()) {
    await inject(CallerService).loadCaller({ url: state.url });
    return true;
  }
  const returnsHere = session.hasKeptSession() || session.hasEndedSession();
  return inject(Router).createUrlTree(['/login'], {
    queryParams: returnsHere ? { returnUrl: state.url } : undefined,
  });
};

/**
 * Opens a page only for a caller with one of `roles`, as the backend resolved them from the
 * token. Without a caller, loading it failed and a notice offers to try again and open the
 * page, so the user stays where they are; a caller without the roles goes to the dashboard.
 */
export function requireRole(...roles: Role[]): CanActivateFn {
  return async (_route, state) => {
    const callers = inject(CallerService);
    await callers.loadCaller({ url: state.url });
    if (!callers.getCaller()) {
      return false;
    }
    if (callers.hasRole(roles)) {
      return true;
    }
    inject(NotifyService).error('Your roles do not include this page.');
    return inject(Router).createUrlTree(['/']);
  };
}
