import type { Router } from '@angular/router';

/** The credentials of a client to sign in as, at the instance of `apiUrl`. */
export interface SignInAs {
  readonly clientId: string;
  readonly clientSecret: string;
  readonly apiUrl: string;
}

const STATE_KEY = 'signInAs';

function isSignInAs(value: unknown): value is SignInAs {
  if (!value || typeof value !== 'object') return false;
  const { clientId, clientSecret, apiUrl } = value as Record<string, unknown>;
  return [clientId, clientSecret, apiUrl].every((part) => typeof part === 'string' && part !== '');
}

/**
 * Opens the login page, which signs in as `client` at once, as a link with credentials does. The
 * credentials travel in the navigation state, not in the address: a secret in a query would stay
 * in the browser's history and could reach logs. Sign out first, or the login page goes back to
 * the signed-in session.
 */
export function signInAs(router: Router, client: SignInAs): Promise<boolean> {
  return router.navigate(['/login'], { state: { [STATE_KEY]: client } });
}

/**
 * The client another page asked the login page to sign in as, once: it is removed from the
 * history entry, so going back and forth does not sign in again or keep the secret.
 */
export function takeSignInAs(): SignInAs | undefined {
  const history = globalThis.history;
  const state = history?.state as Record<string, unknown> | null | undefined;
  const client = state?.[STATE_KEY];
  if (!state || !(STATE_KEY in state)) return undefined;
  const rest = { ...state };
  delete rest[STATE_KEY];
  history.replaceState(rest, '');
  return isSignInAs(client) ? client : undefined;
}
