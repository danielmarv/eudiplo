import { inject, Injectable, type OnDestroy } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { filter, merge, type Subscription } from 'rxjs';
import { type Notice, NotifyService } from '../notify/notify.service';
import { ApiRefusalService } from './api-refusal.service';
import { SessionService } from './session.service';

const CHECK_INTERVAL_MS = 30_000;
const WARN_BEFORE_MS = 5 * 60_000;

type NoticeKind = 'expired' | 'unreachable' | 'revoked';

/**
 * Says on every page when a token that cannot be renewed is about to expire, when the session
 * has expired for good, when the API client lost its access, and when the session cannot be
 * renewed because the backend does not answer. The notices stay until the state changes.
 */
@Injectable({ providedIn: 'root' })
export class TokenExpiryService implements OnDestroy {
  private readonly session = inject(SessionService);
  private readonly refusals = inject(ApiRefusalService);
  private readonly router = inject(Router);
  private readonly notify = inject(NotifyService);

  private timer?: ReturnType<typeof setInterval>;
  private events?: Subscription;
  private checking = false;
  private warnedToken?: string;
  /** A token was seen since the last visit to the login page. */
  private hadToken = false;
  private notice?: { kind: NoticeKind; ref: Notice };

  start(): void {
    if (this.timer) return;
    void this.check();
    this.timer = setInterval(() => void this.check(), CHECK_INTERVAL_MS);
    // The notice changes at once when the session resumes or the user opens another page.
    this.events = merge(
      this.session.tokenRenewed$,
      this.refusals.accessRevoked$,
      this.router.events.pipe(filter((event) => event instanceof NavigationEnd))
    ).subscribe(() => void this.check());
  }

  stop(): void {
    clearInterval(this.timer);
    this.timer = undefined;
    this.events?.unsubscribe();
    this.events = undefined;
  }

  ngOnDestroy(): void {
    this.stop();
  }

  async check(): Promise<void> {
    if (this.checking) return;
    this.checking = true;
    try {
      await this.update();
    } finally {
      this.checking = false;
    }
  }

  private async update(): Promise<void> {
    if (this.router.url.startsWith('/login')) {
      this.hadToken = false;
      this.dismiss();
      return;
    }
    const token = this.session.accessToken;
    if (!token) {
      // OIDC clears the token when its session ends; a logout goes to the login page instead.
      if (this.hadToken) this.showExpired();
      return;
    }
    this.hadToken = true;
    if (this.refusals.isAccessRevoked()) {
      this.showRevoked();
      return;
    }
    // A session that can renew its token does so itself, for example after the laptop slept;
    // it has expired only when renewing fails.
    const authenticated =
      this.session.getAuthenticationStatus() ||
      (this.session.canRefreshToken() && (await this.session.ensureAuthenticated()));
    if (this.router.url.startsWith('/login')) {
      this.dismiss();
      return;
    }
    if (!authenticated) {
      if (this.session.isReconnecting()) this.showUnreachable();
      else if (this.session.areCredentialsRejected()) this.showRevoked();
      else this.showExpired();
      return;
    }
    this.dismiss();
    this.warnBeforeExpiry(token);
  }

  /** Warns once per token that cannot be renewed when it expires within five minutes. */
  private warnBeforeExpiry(token: string): void {
    const remaining = this.session.getTokenTimeRemaining();
    if (remaining >= WARN_BEFORE_MS || this.session.canRefreshToken()) return;
    if (this.warnedToken === token) return;
    this.warnedToken = token;
    const minutes = Math.max(1, Math.floor(remaining / 60_000));
    this.notify.warning(
      `Your session expires in ${minutes} ${minutes === 1 ? 'minute' : 'minutes'}. Save your work.`
    );
  }

  private showExpired(): void {
    this.show(
      'expired',
      'Your session has expired. Sign in again; unsaved changes on this page are lost.',
      () => this.signInAgain(true)
    );
  }

  /** The client was deleted, or its secret changed: signing in with it again fails. */
  private showRevoked(): void {
    this.show(
      'revoked',
      'Your API client no longer has access, for example because it was deleted or got a new secret. Sign in with a client that has access; unsaved changes on this page are lost.',
      () => this.signInAgain(false)
    );
  }

  /** The session resumes by itself once the backend answers, so this offers no sign-out. */
  private showUnreachable(): void {
    this.show(
      'unreachable',
      'The backend does not answer. Your session resumes once it is back; stay on this page to keep unsaved changes.'
    );
  }

  /**
   * Ends the session and opens the login page. After an expiry the login page gets the client
   * and instance of the session, and signing in again as that client returns to this page.
   */
  private signInAgain(expired: boolean): void {
    const returnUrl = this.router.url;
    const sameSso = expired && this.session.usesSso();
    if (expired) this.session.logoutExpired();
    else this.session.logout();
    const queryParams = sameSso || this.session.hasEndedSession() ? { returnUrl } : undefined;
    void this.router.navigate(['/login'], { queryParams });
  }

  /** Opens a notice of this kind unless one is open, replacing a notice of another kind. */
  private show(kind: NoticeKind, message: string, signIn?: () => void): void {
    if (this.notice?.kind === kind) return;
    this.notice?.ref.dismiss();
    const notice: { kind: NoticeKind; ref?: Notice } = { kind };
    notice.ref = this.notify.error(message, {
      duration: Infinity,
      ...(signIn ? { action: { label: 'Sign in', onClick: signIn } } : {}),
      onDismiss: () => {
        if (this.notice === notice) this.notice = undefined;
      },
    });
    this.notice = notice as { kind: NoticeKind; ref: Notice };
  }

  private dismiss(): void {
    const notice = this.notice;
    this.notice = undefined;
    notice?.ref.dismiss();
  }
}
