import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter, type Route } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CallerService } from '../../core/auth/caller.service';
import { NotifyService } from '../../core/notify/notify.service';
import type { Role } from '../../core/auth/role-grants';
import { SESSION_MANAGEMENT_ROUTES } from './session-management.routes';

@Component({ standalone: true, selector: 'app-session-list-route-test', template: 'Session list' })
class SessionListStub {}

@Component({
  standalone: true,
  selector: 'app-session-settings-route-test',
  template: 'Session settings',
})
class SessionSettingsStub {}

@Component({ standalone: true, selector: 'app-dashboard-route-test', template: 'Dashboard' })
class DashboardStub {}

describe('session-management routes', () => {
  let roles: string[];
  let harness: RouterTestingHarness;

  beforeEach(async () => {
    roles = [];
    const callerService = {
      loadCaller: vi.fn(async () => undefined),
      getCaller: () => ({ subject: 'acme-user', tenantId: 'acme', roles }),
      hasRole: (required: Role | Role[]) => {
        const requested = Array.isArray(required) ? required : [required];
        return requested.some((role) => roles.includes(role));
      },
    };
    const sessionRoutes: Route[] = SESSION_MANAGEMENT_ROUTES.map((route) => ({
      path: route.path,
      pathMatch: route.pathMatch,
      title: route.title,
      canActivate: route.canActivate,
      component: route.path === 'config' ? SessionSettingsStub : SessionListStub,
    }));

    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: 'session-management', children: sessionRoutes },
          { path: '', component: DashboardStub },
        ]),
        { provide: CallerService, useValue: callerService },
        { provide: NotifyService, useValue: { error: vi.fn() } },
      ],
    });
    harness = await RouterTestingHarness.create();
  });

  afterEach(() => {
    TestBed.inject(Router).dispose();
  });

  it('allows a read-only session role to open the list but not retention settings', async () => {
    roles = ['sessions:read'];
    const list = await harness.navigateByUrl('/session-management', SessionListStub);
    expect(list).toBeInstanceOf(SessionListStub);

    const dashboard = await harness.navigateByUrl('/session-management/config', DashboardStub);
    expect(dashboard).toBeInstanceOf(DashboardStub);
    expect(TestBed.inject(Router).url).toBe('/');
  });

  it('allows a manager role to open retention settings', async () => {
    roles = ['presentation:manage'];
    const settings = await harness.navigateByUrl('/session-management/config', SessionSettingsStub);
    expect(settings).toBeInstanceOf(SessionSettingsStub);
  });
});
