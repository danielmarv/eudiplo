import { Location } from '@angular/common';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { client } from '@eudiplo/sdk-core';
import { provideTanStackQuery, QueryClient } from '@tanstack/angular-query-experimental';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SessionService } from '../../../core/auth/session.service';
import { NotifyService } from '../../../core/notify/notify.service';
import { suggestTenantId, TenantForm } from './tenant-form';

@Component({ template: '' })
class Blank {}

describe('suggestTenantId', () => {
  it('turns a name into an ID the backend accepts', () => {
    expect(suggestTenantId('Acme Bank (Test)')).toBe('acme-bank-test');
    expect(suggestTenantId('  Universität Köln ')).toBe('universitat-koln');
    expect(suggestTenantId('--Ünique__')).toBe('unique');
    expect(suggestTenantId('x'.repeat(80))).toHaveLength(63);
  });
});

describe('TenantForm', () => {
  /** The requests the page made, as "METHOD /path", with their bodies. */
  let requests: { call: string; body: unknown }[];
  let authMode: string;
  let created: Record<string, unknown>;
  let notify: { success: ReturnType<typeof vi.fn>; error: ReturnType<typeof vi.fn> };
  let session: {
    getBaseUrl: () => string;
    getClientId: () => string;
    usesSso: () => boolean;
    logout: ReturnType<typeof vi.fn>;
    rememberSignedInInstance: ReturnType<typeof vi.fn>;
  };

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });

  const page = () => document.body;
  const text = () => page().textContent?.replace(/\s+/g, ' ') ?? '';
  const input = (id: string) =>
    page().querySelector<HTMLInputElement | HTMLTextAreaElement>(`#${id}`)!;
  const button = (name: string) =>
    [...page().querySelectorAll<HTMLButtonElement>('button')].find(
      (candidate) =>
        candidate.getAttribute('aria-label') === name || candidate.textContent?.trim() === name
    );
  const type = (id: string, value: string) => {
    const field = input(id);
    field.value = value;
    field.dispatchEvent(new Event('input'));
  };
  const writes = () => requests.filter((request) => !request.call.startsWith('GET'));

  async function render(id?: string) {
    const fixture = TestBed.createComponent(TenantForm);
    if (id) fixture.componentRef.setInput('id', id);
    document.body.appendChild(fixture.nativeElement);
    fixture.detectChanges();
    const settle = async (check: () => void) =>
      vi.waitFor(async () => {
        await fixture.whenStable();
        fixture.detectChanges();
        check();
      });
    await settle(() => expect(page().querySelector('form')).not.toBeNull());
    return { fixture, settle };
  }

  beforeEach(() => {
    requests = [];
    authMode = 'builtin';
    created = { id: 'acme-bank', name: 'Acme Bank', status: 'active' };
    notify = { success: vi.fn(), error: vi.fn() };
    session = {
      getBaseUrl: () => 'http://backend.test',
      getClientId: () => 'local-admin',
      usesSso: () => false,
      logout: vi.fn(),
      rememberSignedInInstance: vi.fn(),
    };
    client.setConfig({
      baseUrl: 'http://backend.test',
      fetch: async (request: RequestInfo | URL) => {
        const req = request instanceof Request ? request : new Request(String(request));
        const path = new URL(req.url).pathname;
        const body = req.method === 'GET' ? undefined : await req.json();
        requests.push({ call: `${req.method} ${path}`, body });
        if (path === '/api/frontend-config') return json({ authMode });
        if (req.method === 'POST') return json(created, 201);
        if (path === '/api/tenant/acme') {
          return json({
            id: 'acme',
            name: 'Acme',
            description: 'Old text',
            status: 'active',
            sessionConfig: { ttlSeconds: 3600 },
          });
        }
        return json([]);
      },
    });
    TestBed.configureTestingModule({
      imports: [TenantForm],
      providers: [
        provideRouter([
          { path: 'login', component: Blank },
          { path: 'tenants', component: Blank },
          { path: 'tenants/:id', component: Blank },
        ]),
        provideTanStackQuery(new QueryClient({ defaultOptions: { queries: { retry: false } } })),
        { provide: SessionService, useValue: session },
        { provide: NotifyService, useValue: notify },
      ],
    });
  });

  afterEach(() => {
    client.setConfig({ fetch: () => new Promise<Response>(() => undefined) });
    document.body.innerHTML = '';
  });

  it('suggests the ID from the name until the user types one', async () => {
    const { settle } = await render();

    type('tenant-name', 'Acme Bank');
    await settle(() => expect(input('tenant-id').value).toBe('acme-bank'));

    type('tenant-id', 'acme');
    type('tenant-name', 'Acme Bank Europe');
    await settle(() => expect(input('tenant-name').value).toBe('Acme Bank Europe'));
    expect(input('tenant-id').value).toBe('acme');
  });

  it('says what to fix instead of saving an incomplete form', async () => {
    const { settle } = await render();

    button('Add tenant')!.click();
    await settle(() => expect(text()).toContain('Enter a name.'));
    expect(text()).toContain('Enter an ID.');
    expect(notify.error).toHaveBeenCalledWith('Check the highlighted fields in Identity.');
    expect(writes()).toHaveLength(0);

    type('tenant-name', 'Acme Bank');
    type('tenant-id', 'Acme Bank');
    button('Add tenant')!.click();
    await settle(() => expect(text()).toContain('Use lowercase letters'));
    expect(writes()).toHaveLength(0);
  });

  it('always gives the admin client clients:manage, and fills in a set of roles', async () => {
    const { settle } = await render();
    type('tenant-name', 'Acme Bank');
    const clientsManage = page().querySelector<HTMLElement>('#role-clients\\:manage')!;
    expect(clientsManage.getAttribute('aria-checked') ?? clientsManage.dataset['state']).toMatch(
      /true|checked/
    );

    clientsManage.click();
    button('Verifier')!.click();
    await settle(() => expect(button('Verifier')!.getAttribute('aria-pressed')).toBe('true'));

    button('Add tenant')!.click();
    await settle(() => expect(writes()).toHaveLength(1));
    expect((writes()[0].body as { roles: string[] }).roles).toEqual([
      'clients:manage',
      'presentation:request',
      'presentation:manage',
      'sessions:read',
    ]);
  });

  it('warns that tenants:manage reaches every tenant', async () => {
    const { settle } = await render();
    expect(text()).not.toContain('every tenant of the instance');

    page().querySelector<HTMLElement>('#role-tenants\\:manage')!.click();
    await settle(() => expect(text()).toContain('every tenant of the instance'));
  });

  it('sends the settings the tenant sets, and none it leaves to the instance', async () => {
    const { settle } = await render();
    type('tenant-name', 'Acme Bank');
    button('Instance defaults')!.click();
    await settle(() => expect(page().querySelector('#setting-capacity')).not.toBeNull());

    type('setting-session-ttl', '2');
    const unit = page().querySelector<HTMLSelectElement>('#setting-session-ttl-unit')!;
    unit.value = 'days';
    unit.dispatchEvent(new Event('change'));
    type('setting-capacity', '50');
    button('Add tenant')!.click();
    await settle(() => expect(text()).toContain('Enter at least 100.'));
    expect(writes()).toHaveLength(0);

    type('setting-capacity', '5000');
    button('Add tenant')!.click();
    await settle(() => expect(writes()).toHaveLength(1));
    expect(writes()[0].body).toMatchObject({
      sessionConfig: { ttlSeconds: 172_800 },
      statusListConfig: { capacity: 5000 },
    });
    expect(writes()[0].body).not.toHaveProperty('sessionConfig.cleanupMode');
  });

  it('adds a tenant with an admin client and shows its secret once before opening it', async () => {
    created['client'] = { clientId: 'acme-bank-admin', clientSecret: 'example-secret' };
    const { settle } = await render();
    const router = TestBed.inject(Router);
    type('tenant-name', ' Acme Bank ');
    type('tenant-description', '  For the pilot ');
    page().querySelector<HTMLElement>('#role-issuance\\:offer')!.click();

    button('Add tenant')!.click();
    await settle(() => expect(text()).toContain('example-secret'));
    expect(writes()).toEqual([
      {
        call: 'POST /api/tenant',
        body: {
          id: 'acme-bank',
          name: 'Acme Bank',
          description: 'For the pilot',
          roles: ['clients:manage', 'issuance:offer'],
        },
      },
    ]);
    expect(router.url).not.toBe('/tenants/acme-bank');

    button('I saved the secret')!.click();
    await settle(() => expect(router.url).toBe('/tenants/acme-bank'));
  });

  it('adds a tenant without an admin client', async () => {
    const { settle } = await render();
    const router = TestBed.inject(Router);
    type('tenant-name', 'Acme Bank');
    page().querySelector<HTMLElement>('#tenant-admin-client')!.click();
    await settle(() => expect(text()).toContain("Add the tenant's clients later"));

    button('Add tenant')!.click();
    await settle(() => expect(router.url).toBe('/tenants/acme-bank'));
    expect(writes()[0].body).toEqual({ id: 'acme-bank', name: 'Acme Bank' });
    expect(notify.success).toHaveBeenCalledWith('Tenant Acme Bank added.');
  });

  it('offers no admin client where the identity provider manages the clients', async () => {
    authMode = 'generic';
    const { settle } = await render();
    await settle(() => expect(text()).toContain('No admin client is created'));
    type('tenant-name', 'Acme Bank');

    button('Add tenant')!.click();
    await settle(() => expect(writes()).toHaveLength(1));
    expect(writes()[0].body).toEqual({ id: 'acme-bank', name: 'Acme Bank' });
  });

  it('changes the name of a tenant and leaves an untouched description alone', async () => {
    const { settle } = await render('acme');
    const router = TestBed.inject(Router);
    await settle(() => expect(input('tenant-name').value).toBe('Acme'));
    expect(input('tenant-id').disabled).toBe(true);
    expect(text()).not.toContain('Admin client');

    type('tenant-name', 'Acme University ');
    button('Save changes')!.click();
    await settle(() => expect(router.url).toBe('/tenants/acme'));
    expect(writes()).toEqual([
      { call: 'PATCH /api/tenant/acme', body: { name: 'Acme University' } },
    ]);
    expect(notify.success).toHaveBeenCalledWith('Tenant Acme University saved.');
  });

  it('removes the description when it is emptied', async () => {
    const { settle } = await render('acme');
    await settle(() => expect(input('tenant-description').value).toBe('Old text'));

    type('tenant-description', '   ');
    button('Save changes')!.click();
    await settle(() => expect(writes()).toHaveLength(1));
    expect(writes()[0].body).toEqual({ name: 'Acme', description: null });
  });

  it('shows the settings a tenant sets, and replaces them when they change', async () => {
    const { settle } = await render('acme');
    await settle(() => expect(input('setting-session-ttl').value).toBe('1'));
    expect(page().querySelector<HTMLSelectElement>('#setting-session-ttl-unit')!.value).toBe(
      'hours'
    );

    type('setting-session-ttl', '');
    const aggregation = page().querySelector<HTMLSelectElement>('#setting-aggregation')!;
    aggregation.value = 'no';
    aggregation.dispatchEvent(new Event('change'));
    button('Save changes')!.click();

    await settle(() => expect(writes()).toHaveLength(1));
    expect(writes()[0].body).toEqual({
      name: 'Acme',
      sessionConfig: {},
      statusListConfig: { enableAggregation: false },
    });
  });

  it('signs in as the new admin client through the login page, after saying it ends the session', async () => {
    created['client'] = { clientId: 'acme-bank-admin', clientSecret: 'example-secret' };
    const { settle } = await render();
    const router = TestBed.inject(Router);
    type('tenant-name', 'Acme Bank');
    button('Add tenant')!.click();
    await settle(() => expect(text()).toContain('example-secret'));
    expect(text()).toContain('ends your session as local-admin');

    button('Sign in as this client')!.click();

    await settle(() => expect(router.url).toBe('/login'));
    expect(session.rememberSignedInInstance).toHaveBeenCalledWith('http://backend.test');
    expect(session.logout).toHaveBeenCalled();
    expect((TestBed.inject(Location).getState() as { signInAs?: unknown }).signInAs).toEqual({
      clientId: 'acme-bank-admin',
      clientSecret: 'example-secret',
      apiUrl: 'http://backend.test',
    });
    expect(TestBed.inject(Location).path()).not.toContain('example-secret');
  });

  it('offers no sign-in as the new client after a single sign-on', async () => {
    session.usesSso = () => true;
    created['client'] = { clientId: 'acme-bank-admin', clientSecret: 'example-secret' };
    const { settle } = await render();
    type('tenant-name', 'Acme Bank');
    button('Add tenant')!.click();
    await settle(() => expect(text()).toContain('example-secret'));

    expect(button('Sign in as this client')).toBeUndefined();
  });
});
