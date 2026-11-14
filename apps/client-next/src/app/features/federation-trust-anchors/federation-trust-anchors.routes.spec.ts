import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter, type Route } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CallerService } from '../../core/auth/caller.service';
import { NotifyService } from '../../core/notify/notify.service';
import { FEDERATION_TRUST_ANCHOR_ROUTES } from './federation-trust-anchors.routes';

@Component({ standalone: true, template: 'Trust anchors' })
class TrustAnchorsStub {}

@Component({ standalone: true, template: 'Dashboard' })
class DashboardStub {}

describe('federation trust anchor routes', () => {
  let roles: string[];
  let harness: RouterTestingHarness;
  const notify = { error: vi.fn() };

  beforeEach(async () => {
    roles = [];
    notify.error.mockClear();
    const callerService = {
      loadCaller: vi.fn(async () => undefined),
      getCaller: () => ({ subject: 'acme-user', tenantId: 'acme', roles }),
      hasRole: (required: string | string[]) => {
        const requested = Array.isArray(required) ? required : [required];
        return requested.some((role) => roles.includes(role));
      },
    };
    const anchorRoutes: Route[] = FEDERATION_TRUST_ANCHOR_ROUTES.map((route) => ({
      path: route.path,
      pathMatch: route.pathMatch,
      title: route.title,
      canActivate: route.canActivate,
      component: TrustAnchorsStub,
    }));
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: 'federation-trust-anchor', children: anchorRoutes },
          { path: '', component: DashboardStub },
        ]),
        { provide: CallerService, useValue: callerService },
        { provide: NotifyService, useValue: notify },
      ],
    });
    harness = await RouterTestingHarness.create();
  });

  afterEach(() => {
    TestBed.inject(Router).dispose();
  });

  it('allows issuance and presentation managers and rejects callers with neither role', async () => {
    roles = ['presentation:manage'];
    const detail = await harness.navigateByUrl(
      '/federation-trust-anchor/eu-federation',
      TrustAnchorsStub
    );
    expect(detail).toBeInstanceOf(TrustAnchorsStub);

    roles = [];
    const dashboard = await harness.navigateByUrl('/federation-trust-anchor', DashboardStub);
    expect(dashboard).toBeInstanceOf(DashboardStub);
    expect(TestBed.inject(Router).url).toBe('/');
    expect(notify.error).toHaveBeenCalledWith('Your roles do not include this page.');
  });
});
