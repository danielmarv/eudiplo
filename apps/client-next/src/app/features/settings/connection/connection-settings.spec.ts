import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { client } from '@eudiplo/sdk-core';
import { provideTanStackQuery, QueryClient } from '@tanstack/angular-query-experimental';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type Caller, CallerService } from '../../../core/auth/caller.service';
import { SessionService } from '../../../core/auth/session.service';
import { NotifyService } from '../../../core/notify/notify.service';
import { ConnectionSettings } from './connection-settings';

@Component({ template: '' })
class Blank {}

describe('ConnectionSettings', () => {
  let session: {
    getBaseUrl: () => string;
    getoidcUrl: () => string | undefined;
    getClientId: () => string | undefined;
    getClientSecret: () => string | undefined;
    usesSso: () => boolean;
    getTokenTimeRemaining: () => number;
    canRefreshToken: () => boolean;
    areCredentialsRejected: () => boolean;
    logout: ReturnType<typeof vi.fn>;
  };
  let backend: Record<string, unknown> | 'fail';
  let config: Record<string, unknown> | 'fail';
  let notify: { success: ReturnType<typeof vi.fn>; error: ReturnType<typeof vi.fn> };
  const caller = signal<Caller | undefined>(undefined);
  const env = globalThis as { env?: Record<string, string> };
  const savedEnv = env.env;

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });

  const page = () => document.body;
  const text = () => page().textContent?.replace(/\s+/g, ' ') ?? '';
  const button = (name: string) =>
    [...page().querySelectorAll<HTMLButtonElement>('button')].find(
      (candidate) =>
        candidate.getAttribute('aria-label') === name || candidate.textContent?.trim() === name
    );

  async function render() {
    const fixture = TestBed.createComponent(ConnectionSettings);
    document.body.appendChild(fixture.nativeElement);
    fixture.detectChanges();
    const settle = async (check: () => void) =>
      vi.waitFor(async () => {
        await fixture.whenStable();
        fixture.detectChanges();
        check();
      });
    await settle(() => expect(text()).not.toContain('Checking…'));
    return { fixture, settle };
  }

  beforeEach(() => {
    env.env = { version: '10.1.0', revision: 'abc1234def' };
    backend = { version: '10.1.0', revision: 'abc1234def' };
    config = {
      authMode: 'builtin',
      configImportMode: 'upsert',
      publicUrl: 'https://wallets.example.com',
      grafana: { tempoUid: '', lokiUid: '' },
    };
    caller.set({ subject: 'acme-admin', tenantId: 'acme', roles: ['clients:manage'] });
    session = {
      getBaseUrl: () => 'https://api.example.com',
      getoidcUrl: () => 'https://api.example.com',
      getClientId: () => 'acme-admin',
      getClientSecret: () => 'example-secret',
      usesSso: () => false,
      getTokenTimeRemaining: () => 3_845_000,
      canRefreshToken: () => true,
      areCredentialsRejected: () => false,
      logout: vi.fn(),
    };
    notify = { success: vi.fn(), error: vi.fn() };
    Object.assign(navigator, { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } });
    client.setConfig({
      baseUrl: 'https://api.example.com',
      fetch: async (request: RequestInfo | URL) => {
        const req = request instanceof Request ? request : new Request(String(request));
        const path = new URL(req.url).pathname;
        if (path === '/api/version') return backend === 'fail' ? json({}, 503) : json(backend);
        if (path === '/api/frontend-config')
          return config === 'fail' ? json({}, 503) : json(config);
        return json({}, 404);
      },
    });
    TestBed.configureTestingModule({
      imports: [ConnectionSettings],
      providers: [
        provideRouter([
          { path: 'login', component: Blank },
          { path: 'tenants/:id', component: Blank },
        ]),
        provideTanStackQuery(new QueryClient({ defaultOptions: { queries: { retry: false } } })),
        { provide: SessionService, useValue: session },
        { provide: CallerService, useValue: { loadedCaller: caller } },
        { provide: NotifyService, useValue: notify },
      ],
    });
  });

  afterEach(() => {
    client.setConfig({ fetch: () => new Promise<Response>(() => undefined) });
    document.body.innerHTML = '';
    env.env = savedEnv;
  });

  it('shows the instance, its build next to this one, and how it imports configuration', async () => {
    await render();

    expect(text()).toContain('Same build');
    expect(text()).toContain('v10.1.0');
    expect(text()).toContain('commit abc1234');
    expect(text()).toContain('api.example.com');
    expect(text()).toContain('https://wallets.example.com');
    expect(text()).toContain('Tokens are issued by the instance itself.');
    expect(text()).toContain('Upsert');
    expect(text()).toContain('Creates missing and updates existing resources.');
  });

  it('says when the Web Client and the backend come from different builds', async () => {
    backend = { version: '10.2.0', revision: 'fff0000' };
    await render();

    expect(text()).toContain('Different builds');
    expect(text()).toContain('Run the Web Client image with the same tag as the backend.');
  });

  it('says why the builds cannot be compared for a development build', async () => {
    env.env = {};
    await render();

    expect(text()).toContain('Connected');
    expect(text()).toContain('this Web Client is a development build');
  });

  it('says when the instance does not answer, and what is unavailable', async () => {
    backend = 'fail';
    config = 'fail';
    const { settle } = await render();

    await settle(() => expect(text()).toContain('Not answering'));
    expect(text()).toContain('Version unavailable');
    expect(text()).toContain('Unavailable');
  });

  it('shows who is signed in, with the tenant and roles the backend resolved', async () => {
    caller.set({ subject: 'root', tenantId: 'acme', roles: ['tenants:manage', 'audit:read'] });
    await render();

    expect(text()).toContain('acme-admin');
    expect(page().querySelector('a[href="/tenants/acme"]')).not.toBeNull();
    expect(page().querySelector('[aria-label="Your roles"]')?.textContent).toContain('audit:read');
  });

  it('masks the secret of the tab that signed in, and shows or copies it on request', async () => {
    const { settle } = await render();
    expect(text()).not.toContain('example-secret');

    button('Show the client secret')!.click();
    await settle(() => expect(text()).toContain('example-secret'));

    button('Copy the client secret')!.click();
    await settle(() => expect(notify.success).toHaveBeenCalledWith('Client secret copied.'));
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('example-secret');
  });

  it('shows the time left and that the session renews itself', async () => {
    await render();

    expect(text()).toContain('1 h 04 min');
    expect(text()).toContain('Renews itself before it expires.');
  });

  it('says that a session without the client secret is not renewed, and offers nothing to copy', async () => {
    session.getClientSecret = () => undefined;
    session.canRefreshToken = () => false;
    await render();

    expect(text()).toContain('Not available in this tab');
    expect(button('Copy the client secret')).toBeUndefined();
    expect(text()).toContain('this tab no longer has the client secret');
  });

  it('says why a session whose credentials were rejected is not renewed', async () => {
    session.canRefreshToken = () => false;
    session.areCredentialsRejected = () => true;
    await render();

    expect(text()).toContain("the token endpoint refused the client's credentials");
  });

  it('shows no client ID or secret with single sign-on', async () => {
    session.usesSso = () => true;
    session.getClientId = () => undefined;
    session.getClientSecret = () => undefined;
    await render();

    expect(text()).toContain('Single sign-on');
    expect(text()).not.toContain('Client secret');
    expect(text()).toContain('Subject');
    expect(text()).toContain('Your identity provider renews your access token');
  });

  it('signs out and opens the sign-in page', async () => {
    const { settle } = await render();
    const router = TestBed.inject(Router);

    button('Sign out')!.click();
    await settle(() => expect(router.url).toBe('/login'));
    expect(session.logout).toHaveBeenCalled();
  });
});
