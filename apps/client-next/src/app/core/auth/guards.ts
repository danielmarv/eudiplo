import { inject } from '@angular/core';
import {
  type ActivatedRouteSnapshot,
  type CanActivateFn,
  type Route,
  Router,
} from '@angular/router';
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

/** The roles each route asked for when it was last opened, for `rolesOfPage`. */
const ROUTE_ROLES = new WeakMap<Route, Role[]>();

/**
 * The role sets the open page and the routes above it need, one of each set: what
 * `requireRole` checked when they were opened. Empty for a page open to every caller.
 */
export function rolesOfPage(router: Router): Role[][] {
  const required: Role[][] = [];
  let route: ActivatedRouteSnapshot | null = router.routerState.snapshot.root;
  while (route) {
    const roles = route.routeConfig ? ROUTE_ROLES.get(route.routeConfig) : undefined;
    if (roles) required.push(roles);
    route = route.firstChild;
  }
  return required;
}

/**
 * Opens a page only for a caller with one of `roles`, as the backend resolved them from the
 * token. Without a caller, loading it failed and a notice offers to try again and open the
 * page, so the user stays where they are; a caller without the roles goes to the dashboard.
 */
export function requireRole(...roles: Role[]): CanActivateFn {
  return async (route, state) => {
    if (route.routeConfig) ROUTE_ROLES.set(route.routeConfig, roles);
    const callers = inject(CallerService);
    const router = inject(Router);
    const notify = inject(NotifyService);
    await callers.loadCaller({ url: state.url });
    if (!callers.getCaller()) {
      return false;
    }
    if (callers.hasRole(roles)) {
      return true;
    }
    notify.error('Your roles do not include this page.');
    return router.createUrlTree(['/']);
  };
}
