import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { Subject } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NotifyService } from '../notify/notify.service';
import { ApiRefusalService } from './api-refusal.service';
import { CallerService } from './caller.service';
import { OidcService } from './oidc.service';
import { RoleChangeService } from './role-change.service';
import { SessionService } from './session.service';
import { TokenExpiryService } from './token-expiry.service';

describe('session watchers', () => {
  let session: Record<string, unknown> & { tokenRenewed$: Subject<void> };
  let refusals: {
    accessRevoked$: Subject<void>;
    rolesRefusedWithoutRenewal$: Subject<void>;
    isAccessRevoked: () => boolean;
  };
  let caller: { subject: string; roles: string[] } | undefined;
  let notify: Record<'success' | 'info' | 'warning' | 'error', ReturnType<typeof vi.fn>>;
  let revoked: boolean;

  beforeEach(() => {
    revoked = false;
    session = {
      tokenRenewed$: new Subject<void>(),
      accessToken: 'token-1',
      getAuthenticationStatus: () => true,
      canRefreshToken: () => false,
      ensureAuthenticated: async () => false,
      isReconnecting: () => false,
      areCredentialsRejected: () => false,
      getTokenTimeRemaining: () => 2 * 60_000,
      usesSso: () => false,
      hasEndedSession: () => false,
      logout: vi.fn(),
      logoutExpired: vi.fn(),
    };
    refusals = {
      accessRevoked$: new Subject<void>(),
      rolesRefusedWithoutRenewal$: new Subject<void>(),
      isAccessRevoked: () => revoked,
    };
    caller = { subject: 'console', roles: ['issuance:manage', 'audit:read'] };
    const dismiss = vi.fn();
    notify = {
      success: vi.fn(() => ({ dismiss })),
      info: vi.fn(() => ({ dismiss })),
      warning: vi.fn(() => ({ dismiss })),
      error: vi.fn(() => ({ dismiss })),
    };
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: SessionService, useValue: session },
        { provide: ApiRefusalService, useValue: refusals },
        { provide: OidcService, useValue: { mode: 'local', tokenRefreshed$: new Subject<void>() } },
        {
          provide: CallerService,
          useValue: {
            getCaller: () => caller,
            loadCaller: vi.fn(async () => undefined),
            hasRole: (roles: string[]) => roles.some((role) => caller?.roles.includes(role)),
          },
        },
        { provide: NotifyService, useValue: notify },
      ],
    });
  });

  afterEach(() => {
    TestBed.inject(TokenExpiryService).stop();
    TestBed.inject(RoleChangeService).stop();
  });

  it('warns once before a token that cannot be renewed expires', async () => {
    const service = TestBed.inject(TokenExpiryService);
    await service.check();
    await service.check();
    expect(notify.warning).toHaveBeenCalledTimes(1);
    expect(notify.warning).toHaveBeenCalledWith(
      'Your session expires in 2 minutes. Save your work.'
    );
  });

  it('says when the API client lost its access, with a way to sign in again', async () => {
    revoked = true;
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    await TestBed.inject(TokenExpiryService).check();
    expect(notify.error).toHaveBeenCalledWith(
      expect.stringContaining('Your API client no longer has access'),
      expect.objectContaining({
        duration: Infinity,
        action: expect.objectContaining({ label: 'Sign in' }),
      })
    );
    notify.error.mock.calls[0][1].action.onClick();
    expect(session['logout']).toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledWith(['/login'], { queryParams: undefined });
  });

  it('names the roles a renewed token lost', async () => {
    TestBed.inject(RoleChangeService).start();
    const loadCaller = TestBed.inject(CallerService).loadCaller as ReturnType<typeof vi.fn>;
    loadCaller.mockImplementation(async () => {
      caller = { subject: 'console', roles: ['issuance:manage'] };
    });
    session.tokenRenewed$.next();
    await vi.waitFor(() =>
      expect(notify.warning).toHaveBeenCalledWith(
        'Your API client no longer has the role audit:read; the pages that need it are hidden.'
      )
    );
  });
});
