import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { client } from '@eudiplo/sdk-core';
import { provideTanStackQuery, QueryClient } from '@tanstack/angular-query-experimental';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CallerService } from '../../../core/auth/caller.service';
import { SessionService } from '../../../core/auth/session.service';
import { NotifyService } from '../../../core/notify/notify.service';
import { TenantDetail } from './tenant-detail';

@Component({ template: '' })
class Blank {}

describe('TenantDetail', () => {
  let requests: string[];
  let tenant: Record<string, unknown>;
  let authMode: string;
  let notify: { success: ReturnType<typeof vi.fn>; error: ReturnType<typeof vi.fn> };

  const json = (body: unknown, status = 200) =>
    new Response(status === 204 ? null : JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });

  const page = () => document.body;
  const text = () => page().textContent?.replace(/\s+/g, ' ') ?? '';
  const rows = () => [...page().querySelectorAll('tbody tr')];
  const button = (name: string) =>
    [...page().querySelectorAll<HTMLButtonElement>('button')].find(
      (candidate) =>
        candidate.getAttribute('aria-label') === name || candidate.textContent?.trim() === name
    );
  /** The value a setting shows, by its label. */
  const setting = (label: string) =>
    [...page().querySelectorAll('dl > div')]
      .find((row) => row.querySelector('dt')?.textContent?.trim() === label)
      ?.querySelector('dd')
      ?.textContent?.replace(/\s+/g, ' ')
      .trim();

  async function render(id: string) {
    const fixture = TestBed.createComponent(TenantDetail);
    fixture.componentRef.setInput('id', id);
    document.body.appendChild(fixture.nativeElement);
    fixture.detectChanges();
    const settle = async (check: () => void) =>
      vi.waitFor(async () => {
        await fixture.whenStable();
        fixture.detectChanges();
        check();
      });
    await settle(() => expect(page().querySelector('hlm-skeleton')).toBeNull());
    return { fixture, settle };
  }

  beforeEach(() => {
    requests = [];
    authMode = 'builtin';
    tenant = {
      id: 'acme',
      name: 'Acme University',
      description: 'Issues student IDs',
      status: 'active',
      sessionConfig: { ttlSeconds: 7200, cleanupMode: 'anonymize' },
      statusListConfig: { bits: 2, immediateUpdate: false },
      defaultKeyChains: { access: 'acme-access' },
      clients: [
        {
          clientId: 'acme-admin',
          description: 'Admin client',
          roles: ['clients:manage', 'clients:manage', 'issuance:manage'],
        },
        { clientId: 'acme-issuer', roles: ['issuance:offer'] },
      ],
    };
    notify = { success: vi.fn(), error: vi.fn() };
    client.setConfig({
      baseUrl: 'http://backend.test',
      fetch: async (request: RequestInfo | URL) => {
        const req = request instanceof Request ? request : new Request(String(request));
        const path = new URL(req.url).pathname;
        requests.push(`${req.method} ${path}`);
        if (path === '/api/frontend-config') return json({ authMode });
        if (req.method === 'DELETE') return json(null, 204);
        if (path === '/api/tenant/acme') return json(tenant);
        if (path === '/api/tenant') return json([tenant]);
        if (path === '/api/client/acme-issuer/rotate-secret') return json({ secret: 'rotated-secret' }, 201);
        return json({ statusCode: 404, message: 'Tenant not found' }, 404);
      },
    });
    TestBed.configureTestingModule({
      imports: [TenantDetail],
      providers: [
        provideRouter([
          { path: 'tenants', component: Blank },
          { path: 'tenants/:id/edit', component: Blank },
        ]),
        provideTanStackQuery(new QueryClient({ defaultOptions: { queries: { retry: false } } })),
        {
          provide: SessionService,
          useValue: {
            getBaseUrl: () => 'http://backend.test',
            getClientId: () => 'root',
            usesSso: () => false,
          },
        },
        {
          provide: CallerService,
          useValue: {
            loadedCaller: signal({ subject: 'root', tenantId: null, roles: ['tenants:manage'] }),
          },
        },
        { provide: NotifyService, useValue: notify },
      ],
    });
  });

  afterEach(() => {
    client.setConfig({ fetch: () => new Promise<Response>(() => undefined) });
    document.body.innerHTML = '';
  });

  it('shows the tenant, its clients with each role once, and its settings', async () => {
    await render('acme');

    expect(page().querySelector('h1')?.textContent?.trim()).toBe('Acme University');
    expect(text()).toContain('Issues student IDs');
    expect(text()).toContain('Active');
    expect(rows()).toHaveLength(2);
    expect(rows()[0].textContent).toContain('acme-admin');
    expect(rows()[0].querySelectorAll('li')).toHaveLength(2);
    expect(page().querySelector('app-table-pagination')?.textContent).toContain('of 2 clients');

    expect(setting('Kept for')).toBe('2 hours');
    expect(setting('Then')).toBe('Personal data removed, metadata kept');
    expect(setting('Status size')).toBe('2 bits: valid, revoked or suspended');
    expect(setting('Republished')).toBe('When it expires');
    expect(setting('Entries per list')).toBe('Instance default, from STATUS_CAPACITY');
    expect(setting('Access')).toBe('acme-access');
    expect(setting('Authorization server')).toBe('The oldest of its kind');
    expect(text()).toContain('2 of 5 set here');
  });

  it('counts the clients of each role, names the roles none has, and lists the holders of one', async () => {
    const { settle } = await render('acme');
    const role = (name: string) =>
      [...page().querySelectorAll<HTMLButtonElement>('app-role-coverage button')].find(
        (candidate) => candidate.textContent?.includes(name)
      )!;

    expect(role('clients:manage').textContent).toContain('1 client');
    expect(role('issuance:manage').textContent).toContain('1 client');
    const missing = page().querySelector('app-role-coverage')!.textContent!;
    expect(missing).toContain('No client has');
    expect(missing).toContain('keys:manage');

    role('issuance:offer').click();
    await settle(() => expect(rows()).toHaveLength(1));
    expect(rows()[0].textContent).toContain('acme-issuer');
    expect(role('issuance:offer').getAttribute('aria-pressed')).toBe('true');

    role('issuance:offer').click();
    await settle(() => expect(rows()).toHaveLength(2));
  });

  it('finds clients by ID, description or role', async () => {
    const { settle } = await render('acme');
    const search = page().querySelector<HTMLInputElement>('input[type="search"]')!;

    search.value = 'issuance:offer';
    search.dispatchEvent(new Event('input'));
    await settle(() => expect(rows()).toHaveLength(1));
    expect(rows()[0].textContent).toContain('acme-issuer');

    search.value = 'nobody';
    search.dispatchEvent(new Event('input'));
    await settle(() => expect(text()).toContain('No client matches “nobody”'));
  });

  it('says when setting up the tenant did not finish', async () => {
    tenant['status'] = null;
    await render('acme');

    expect(text()).toContain('Not set up');
    expect(text()).toContain('Setting up this tenant did not finish');
  });

  it('says where the identity provider manages the clients', async () => {
    authMode = 'generic';
    await render('acme');

    expect(text()).toContain("The identity provider manages this tenant's clients");
  });

  it('says when there is no such tenant', async () => {
    await render('ghost');

    expect(text()).toContain('There is no tenant ghost');
    expect(page().querySelector('a[href="/tenants"]')).not.toBeNull();
  });

  it('deletes the tenant after the confirmation and opens the list', async () => {
    const { settle } = await render('acme');
    const router = TestBed.inject(Router);

    button('Delete')!.click();
    await settle(() => expect(text()).toContain('Delete tenant Acme University?'));
    expect(requests).not.toContain('DELETE /api/tenant/acme');

    button('Delete tenant')!.click();
    await settle(() => expect(router.url).toBe('/tenants'));
    expect(requests).toContain('DELETE /api/tenant/acme');
    expect(notify.success).toHaveBeenCalledWith('Tenant Acme University deleted.');
  });

  it('gives a client a new secret after asking and shows it once', async () => {
    const { settle } = await render('acme');
    await settle(() => expect(button('Replace the secret of acme-issuer')).toBeDefined());
    button('Replace the secret of acme-issuer')!.click();
    await settle(() => expect(button('Replace secret')).toBeDefined());
    button('Replace secret')!.click();
    await settle(() => expect(text()).toContain('rotated-secret'));
    expect(requests).toContain('POST /api/client/acme-issuer/rotate-secret');
  });
});
