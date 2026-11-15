import { inject, Injectable, type OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import { merge, type Subscription } from 'rxjs';
import { NotifyService } from '../notify/notify.service';
import { ApiRefusalService } from './api-refusal.service';
import { CallerService } from './caller.service';
import { rolesOfPage } from './guards';
import { OidcService } from './oidc.service';
import { SessionService } from './session.service';

/** Shortest time between two reloads of the caller after the backend refused a role. */
const RELOAD_INTERVAL_MS = 60_000;

interface SeenCaller {
  client?: string;
  roles: string[];
}

/**
 * Says when the signed-in client or person lost roles. The menu follows the roles of each new
 * token, so the roles before and after are compared. A page that needs a lost role is left only
 * on request, so unsaved changes can be copied first. A tab without the client secret cannot get
 * a new token; when the backend's role check refuses a request, it loads the caller of its token
 * again, at most once a minute.
 */
@Injectable({ providedIn: 'root' })
export class RoleChangeService implements OnDestroy {
  private readonly session = inject(SessionService);
  private readonly oidc = inject(OidcService);
  private readonly refusals = inject(ApiRefusalService);
  private readonly callers = inject(CallerService);
  private readonly router = inject(Router);
  private readonly notify = inject(NotifyService);

  private subscription?: Subscription;
  private reloaded?: { token: string; at: number };

  start(): void {
    if (this.subscription) return;
    this.subscription = merge(this.session.tokenRenewed$, this.oidc.tokenRefreshed$).subscribe(
      () => void this.recheck()
    );
    this.subscription.add(
      this.refusals.rolesRefusedWithoutRenewal$.subscribe(() => void this.recheck(true))
    );
  }

  stop(): void {
    this.subscription?.unsubscribe();
    this.subscription = undefined;
  }

  ngOnDestroy(): void {
    this.stop();
  }

  private async recheck(reload = false): Promise<void> {
    if (reload && this.router.url.startsWith('/login')) return;
    if (reload && this.current() && this.pageNeedsMissingRole()) {
      this.offerToLeave(
        `${this.holder()} lacks a role this page needs. Copy unsaved changes before you leave it.`
      );
      return;
    }
    if (reload) {
      const token = this.session.accessToken;
      const at = Date.now();
      if (this.reloaded?.token === token && at - this.reloaded.at < RELOAD_INTERVAL_MS) return;
      this.reloaded = { token, at };
    }
    const before = this.current();
    await this.callers.loadCaller({ reload });
    if (!this.subscription || this.compare(before) || !reload) return;
    if (this.current() && this.pageNeedsMissingRole()) {
      this.offerToLeave(
        `${this.holder()} lacks a role this page needs. Copy unsaved changes before you leave it.`
      );
    }
  }

  /** Who holds the roles: a person with single sign-on, otherwise the API client. */
  private holder(): string {
    return this.oidc.mode === 'oidc' ? 'Your account' : 'Your API client';
  }

  /** Names the roles lost since `before`; true when it said so. */
  private compare(before: SeenCaller | undefined): boolean {
    const now = this.current();
    // A sign-in, also as another client, starts over; a logout forgets the caller.
    if (!before || !now || before.client !== now.client || this.router.url.startsWith('/login')) {
      return false;
    }
    const lost = before.roles.filter((role) => !now.roles.includes(role));
    if (!lost.length) return false;
    const named = lost.length === 1 ? `the role ${lost[0]}` : `the roles ${lost.join(', ')}`;
    if (this.pageNeedsMissingRole()) {
      this.offerToLeave(
        `${this.holder()} no longer has ${named}, which this page needs. Copy unsaved changes before you leave it.`
      );
      return true;
    }
    this.notify.warning(
      `${this.holder()} no longer has ${named}; the pages that need ${lost.length === 1 ? 'it' : 'them'} are hidden.`
    );
    return true;
  }

  private pageNeedsMissingRole(): boolean {
    return rolesOfPage(this.router).some((roles) => !this.callers.hasRole(roles));
  }

  private offerToLeave(message: string): void {
    this.notify.warning(message, {
      duration: Infinity,
      action: { label: 'Leave page', onClick: () => void this.router.navigate(['/']) },
    });
  }

  private current(): SeenCaller | undefined {
    const caller = this.callers.getCaller();
    return caller ? { client: caller.subject ?? undefined, roles: caller.roles } : undefined;
  }
}
