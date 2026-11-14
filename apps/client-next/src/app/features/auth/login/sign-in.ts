import { OAuth2HttpError } from '@badgateway/oauth2-client';
import type { OidcProvider } from '../../../core/auth/oidc.service';
import { apiErrorDetail, asSentence } from '../../../core/errors/error-message';

/** The client and instance of a session the login page resumes or reports as ended. */
export interface PreviousSession {
  clientId?: string;
  baseUrl?: string;
}

/**
 * What an instance a link chose receives when the user signs in there: the access token of a
 * single sign-on, the client secret the user entered, or the session of the link's own client.
 */
export type LinkedInstanceReceives = 'token' | 'secret' | 'link-client';

/**
 * The error codes of a token endpoint that refuses a request (RFC 6749, section 5.2), with
 * what to check at the identity provider. `invalid_client` counts as wrong credentials.
 */
const TOKEN_ERROR_HINTS = new Map<string, string>([
  ['invalid_request', 'Check the client at the identity provider.'],
  ['invalid_grant', 'Check the client at the identity provider.'],
  [
    'unauthorized_client',
    'Check that this client may use the client credentials grant at the identity provider.',
  ],
  [
    'unsupported_grant_type',
    'Check that the identity provider offers the client credentials grant.',
  ],
  ['invalid_scope', 'Check the scopes this client may request at the identity provider.'],
]);

/**
 * Why a sign-in with client credentials failed and what to check, with the token endpoint's
 * own reason when it gives one. The built-in server answers a wrong secret with a Nest body
 * (`error: "Unauthorized"`), another identity provider with an RFC 6749 error code, so the
 * status decides first.
 */
export function signInFailure(error: unknown): string {
  const http = error instanceof OAuth2HttpError ? error : undefined;
  const other = error as { status?: unknown; message?: unknown; name?: unknown } | undefined;
  const status = http ? http.httpCode : other?.status;
  const message = http ? '' : String(other?.message ?? '');
  const code = http?.oauth2Code ?? undefined;
  const detail = http ? apiErrorDetail(http.parsedBody) : undefined;
  const reason = detail && detail !== code ? ` The token endpoint says: ${asSentence(detail)}` : '';

  if (!http && (message.includes('fetch') || other?.name === 'TypeError')) {
    return 'Could not connect to EUDIPLO. Check if the instance URL is correct and the server is running.';
  }
  if (status === 401 || code === 'invalid_client' || message.includes('401')) {
    return `Invalid credentials. Please check your Client ID and Client Secret.${reason}`;
  }
  if (status === 404 || message.includes('404')) {
    return 'Endpoint not found. Please verify the EUDIPLO instance URL.';
  }
  const hint = code ? TOKEN_ERROR_HINTS.get(code) : undefined;
  if (code && hint) {
    return `The token endpoint refused the sign-in (${code}).${reason} ${hint}`;
  }
  if (typeof status === 'number' && status >= 500) {
    return `The token endpoint failed with status ${status}. Try again later.${reason}`;
  }
  return 'Please check your credentials and instance URL.';
}

/**
 * Why an SSO sign-in could not start. keycloak-js needs the Web Crypto API, which browsers
 * offer only on secure pages, and with another provider it first loads that provider's
 * discovery document in the browser.
 */
export function ssoStartFailure(error: unknown, issuer: string, provider?: OidcProvider): string {
  if (globalThis.isSecureContext === false) {
    return 'Single sign-on needs a secure page: open the Web Client over HTTPS or on localhost.';
  }
  if (provider === 'generic') {
    const response = (error as { response?: unknown } | null)?.response;
    if (response instanceof Response) {
      return (
        `The identity provider at ${issuer} answered the request for its sign-in settings ` +
        `with status ${response.status}. Check OIDC on the backend.`
      );
    }
    if (error instanceof TypeError) {
      return (
        `Could not load the sign-in settings of the identity provider at ${issuer}. ` +
        `Check that it is reachable and allows requests from ${globalThis.location.origin}.`
      );
    }
  }
  const detail = error instanceof Error ? error.message : undefined;
  return detail
    ? `Single sign-on could not start: ${asSentence(detail)}`
    : 'Single sign-on could not start.';
}

const SSO_RETURN_URL_KEY = 'oidc_return_url';

/** Keeps the page to open after an SSO sign-in for this tab, or forgets an older one. */
export function keepSsoReturnUrl(returnUrl: string | undefined): void {
  try {
    if (returnUrl) sessionStorage.setItem(SSO_RETURN_URL_KEY, returnUrl);
    else sessionStorage.removeItem(SSO_RETURN_URL_KEY);
  } catch {
    // Without storage the dashboard opens after the sign-in.
  }
}

/** The page kept by {@link keepSsoReturnUrl}, which is then forgotten. */
export function takeSsoReturnUrl(): string | undefined {
  try {
    const returnUrl = sessionStorage.getItem(SSO_RETURN_URL_KEY) ?? undefined;
    sessionStorage.removeItem(SSO_RETURN_URL_KEY);
    return returnUrl;
  } catch {
    return undefined;
  }
}

/** The return path if it stays inside the client and does not lead back to the login page. */
export function appPath(returnUrl: unknown): string | undefined {
  return typeof returnUrl === 'string' &&
    returnUrl.startsWith('/') &&
    !returnUrl.startsWith('//') &&
    !returnUrl.startsWith('/login')
    ? returnUrl
    : undefined;
}

/** The question before signing in at `url`, which the link that opened the page chose. */
export function linkedInstanceQuestion(url: string, receives: LinkedInstanceReceives): string {
  const consequence = {
    token:
      'After you sign in, the console sends it your access token, which lets it act with your roles.',
    'link-client':
      'It signs you in with the client the link names, and everything you do in the console goes to this instance.',
    secret: 'Signing in sends it the client secret you entered, which lets it act as this client.',
  }[receives];
  return `The link you opened chose the EUDIPLO instance ${url}. ${consequence} Sign in only if you trust this instance.`;
}
