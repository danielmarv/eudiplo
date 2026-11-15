import type { Session, SessionOutcomeCredentialDto } from '@eudiplo/sdk-core';
import { hasHttpStatus } from '../../core/errors/error-message';

/**
 * How a session ended and what the caller may do with it, by the backend's rules
 * (`apps/backend/src/session/session.controller.ts`, `session-scope.ts`). The backend has the
 * final say.
 */

/** Presentation sessions carry their presentation configuration ID; issuance sessions have none. */
export function isPresentationSession(
  session: Pick<Session, 'requestId'> | null | undefined
): boolean {
  return !!session?.requestId;
}

/** Offers and requests a wallet has neither redeemed nor finished, the only ones that can be cancelled. */
export function isCancellable(session: Pick<Session, 'status' | 'consumed'>): boolean {
  return (session.status === 'active' || session.status === 'fetched') && !session.consumed;
}

/** Whether a cancellation was refused because the session is no longer pending (HTTP 409). */
export function isCancelConflict(error: unknown): boolean {
  return hasHttpStatus(error, 409);
}

/** Roles that cancel and delete sessions, each within its side. */
const SESSION_CHANGER_ROLES = ['issuance:offer', 'presentation:request'];

/**
 * Whether the caller may cancel and delete this session, and sees its offer or request: one of
 * the changer roles, and a role of the session's side (`sessions:read` reads both but is none).
 */
export function maySessionChange(
  roles: readonly string[],
  session: Pick<Session, 'requestId'>
): boolean {
  const side = isPresentationSession(session)
    ? ['presentation:request', 'presentation:manage']
    : ['issuance:offer', 'issuance:manage'];
  return (
    SESSION_CHANGER_ROLES.some((role) => roles.includes(role)) &&
    side.some((role) => roles.includes(role))
  );
}

/** The role of the page that creates sessions of this type again. */
export function sessionOfferRole(session: Pick<Session, 'requestId'>): string {
  return isPresentationSession(session) ? 'presentation:request' : 'issuance:offer';
}

/** Roles that read the credential status of an issuance session. */
export const CREDENTIAL_STATUS_READER_ROLES = [
  'issuance:offer',
  'issuance:manage',
  'credentials:status',
  'sessions:read',
];

/** Roles that revoke, suspend or reinstate credentials. */
export const CREDENTIAL_STATUS_CHANGER_ROLES = ['credentials:status', 'issuance:manage'];

export function sessionStatusLabel(status: string | null | undefined): string {
  switch (status) {
    case 'active':
      return 'Active';
    case 'fetched':
      return 'Fetched';
    case 'completed':
      return 'Completed';
    case 'expired':
      return 'Expired';
    case 'failed':
      return 'Failed';
    case 'cancelled':
      return 'Cancelled';
    default:
      return status || 'Unknown';
  }
}

/** What the session page says about how a session ended. */
export interface SessionResult {
  tone: 'success' | 'error' | 'neutral';
  title: string;
  /** Why it ended this way, or null when nothing was recorded. */
  message: string | null;
  /** The wallet's own text with its error or notification; wallet-controlled. */
  walletDescription: string | null;
  /** The reason the operator gave when cancelling the session. */
  cancelReason: string | null;
  /** Machine-readable failure code, for failed sessions. */
  code: string | null;
  /** The wallet refused a presentation request, likely because of how it was built. */
  checkRequest: boolean;
  credentials: SessionOutcomeCredentialDto[];
}

type ResultSession = Pick<
  Session,
  'status' | 'outcome' | 'errorReason' | 'failureCode' | 'cancelReason' | 'requestId' | 'consumed'
>;

/** Titles for presentation failures the wallet reported, by failure code. */
const WALLET_FAILURE_TITLES: Record<string, string> = {
  access_denied: 'The user declined the request in the wallet',
};

/** How a finished session ended, from its status and `outcome`; null while it is pending. */
export function sessionResult(session: ResultSession): SessionResult | null {
  const outcome = session.outcome ?? null;
  const presentation = isPresentationSession(session);
  const base = {
    message: outcome?.message ?? session.errorReason ?? null,
    walletDescription: null,
    cancelReason: null,
    code: null,
    checkRequest: false,
    credentials: outcome?.credentials ?? [],
  };

  switch (session.status) {
    case 'failed':
      return failedResult(session, presentation, base);
    case 'completed':
      return {
        ...base,
        tone: 'success',
        title: presentation ? 'Presentation verified' : 'Credentials issued',
        message: null,
      };
    case 'expired':
      // An issuance whose offer was redeemed got its credentials; only the wallet's optional
      // confirmation is missing.
      if (!presentation && session.consumed) {
        return {
          ...base,
          tone: 'neutral',
          title: 'Credentials issued, not confirmed',
          message:
            'The wallet redeemed the offer but did not confirm the credentials before the session expired. Wallets do not have to send this confirmation.',
        };
      }
      return {
        ...base,
        tone: 'neutral',
        title: 'Session expired',
        message: presentation
          ? 'No wallet answered the request before it expired.'
          : 'No wallet redeemed the offer before it expired.',
      };
    case 'cancelled': {
      const cancelReason = session.cancelReason || null;
      const before = presentation
        ? 'It was cancelled before a wallet answered the request.'
        : 'It was cancelled before a wallet redeemed the offer.';
      return {
        ...base,
        tone: 'neutral',
        title: 'Session cancelled',
        // Older sessions kept the reason only in the session log.
        message: cancelReason ? before : `${before} No reason was given.`,
        cancelReason,
      };
    }
    default:
      return null;
  }
}

function failedResult(
  session: ResultSession,
  presentation: boolean,
  base: Omit<SessionResult, 'tone' | 'title'>
): SessionResult {
  const outcome = session.outcome ?? null;
  const code = session.failureCode ?? outcome?.error ?? null;
  const failed = { ...base, tone: 'error' as const, code };

  if (outcome?.source === 'wallet' && !presentation) {
    // An OpenID4VCI notification: the backend's message names the event.
    return {
      ...failed,
      title: outcome.message ?? 'The wallet reported an error',
      message:
        'The credential was already issued. Revoke it under Credential status if it must not stay valid.',
      walletDescription: outcome.description ?? null,
    };
  }
  if (outcome?.source === 'wallet') {
    const known = code ? WALLET_FAILURE_TITLES[code] : undefined;
    return {
      ...failed,
      title: known ?? 'The wallet rejected the request',
      message: outcome.description || known ? null : base.message,
      walletDescription: outcome.description ?? null,
      checkRequest: !known,
    };
  }
  return { ...failed, title: presentation ? 'Presentation failed' : 'Issuance failed' };
}
