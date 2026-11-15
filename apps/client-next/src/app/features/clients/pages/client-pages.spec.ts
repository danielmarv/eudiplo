import { signal, type Type } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { client } from '@eudiplo/sdk-core';
import { provideTanStackQuery, QueryClient } from '@tanstack/angular-query-experimental';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type Caller, CallerService } from '../../../core/auth/caller.service';
import { SessionService } from '../../../core/auth/session.service';
import { NotifyService } from '../../../core/notify/notify.service';
import { expectUnavailable } from '../../../shared/testing/unavailable-action';
import { ClientDetail } from './client-detail';
import { ClientForm } from './client-form';
import { ClientList } from './client-list';

describe('API client pages', () => {
  let clients: Record<string, unknown>[] | 'unavailable';
  let ownership: unknown[];
  let requests: { method: string; path: string; body?: unknown }[];
  let notify: Record<'success' | 'info' | 'warning' | 'error', ReturnType<typeof vi.fn>>;
  let session: {
    getBaseUrl: () => string;
    getClientId: () => string;
    usesSso: () => boolean;
    logout: ReturnType<typeof vi.fn>;
    useRotatedSecret: ReturnType<typeof vi.fn>;
    refreshAccessToken: ReturnType<typeof vi.fn>;
  };
  const caller = signal<Caller | undefined>(undefined);

  const json = (body: unknown, status = 200) =>
    new Response(body === undefined ? null : JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });

  const page = () => document.body;
  const text = (element: Element | null = page()) =>
    element?.textContent?.replace(/\s+/g, ' ') ?? '';
  const rows = () => [...page().querySelectorAll('tbody tr')];
  const button = (name: string) =>
    [...page().querySelectorAll<HTMLButtonElement>('button')].find(
      (candidate) => candidate.textContent?.replace(/\s+/g, ' ').trim() === name
    );
  const labelled = (label: string) =>
    page().querySelector<HTMLButtonElement>(`[aria-label="${label}"]`)!;
  const type = (id: string, value: string) => {
    const input = page().querySelector<HTMLInputElement>(`#${id}`)!;
    input.value = value;
    input.dispatchEvent(new Event('input'));
  };

  async function render<T>(component: Type<T>, inputs: Record<string, unknown> = {}) {
    const fixture = TestBed.createComponent(component);
    for (const [name, value] of Object.entries(inputs)) fixture.componentRef.setInput(name, value);
    document.body.appendChild(fixture.nativeElement);
    fixture.detectChanges();
    const settle = async (check: () => void) =>
      vi.waitFor(async () => {
        await fixture.whenStable();
        fixture.detectChanges();
        check();
      });
    await settle(() => expect(page().querySelector('[role="status"] hlm-skeleton')).toBeNull());
    return { fixture, settle };
  }

  beforeEach(() => {
    clients = [
      {
        clientId: 'acme-admin',
        tenantId: 'acme',
        description: 'Console',
        roles: ['clients:manage', 'issuance:manage'],
      },
      {
        clientId: 'crm',
        tenantId: 'acme',
        description: 'Issues membership cards',
        roles: ['issuance:offer'],
        allowedIssuanceConfigs: ['membership'],
      },
      { clientId: 'ops', tenantId: 'acme', roles: ['tenant:admin'] },
    ];
    ownership = [];
    requests = [];
    notify = { success: vi.fn(), info: vi.fn(), warning: vi.fn(), error: vi.fn() };
    session = {
      getBaseUrl: () => 'http://backend.test',
      getClientId: () => 'acme-admin',
      usesSso: () => false,
      logout: vi.fn(),
      useRotatedSecret: vi.fn().mockResolvedValue(undefined),
      refreshAccessToken: vi.fn().mockResolvedValue(undefined),
    };
    caller.set({
      subject: 'acme-admin',
      tenantId: 'acme',
      roles: ['clients:manage', 'issuance:manage', 'issuance:offer'],
    });
    client.setConfig({
      baseUrl: 'http://backend.test',
      fetch: async (request: RequestInfo | URL) => {
        const call = request instanceof Request ? request : new Request(String(request));
        const path = new URL(call.url).pathname;
        const body = ['POST', 'PATCH'].includes(call.method)
          ? await call
              .clone()
              .text()
              .then((raw) => (raw ? JSON.parse(raw) : undefined))
          : undefined;
        requests.push({ method: call.method, path, body });
        if (path === '/api/client') {
          if (clients === 'unavailable') {
            return json(
              { statusCode: 501, message: 'The identity provider manages clients.' },
              501
            );
          }
          if (call.method === 'POST') {
            return json({ ...(body as object), clientSecret: 's3cret-once' }, 201);
          }
          return json(clients);
        }
        const secret = /^\/api\/client\/([^/]+)\/rotate-secret$/.exec(path)?.[1];
        if (secret) return json({ secret: 'n3w-secret' }, 201);
        const one = /^\/api\/client\/([^/]+)$/.exec(path)?.[1];
        if (one) {
          const all = clients === 'unavailable' ? [] : clients;
          const found = all.find((item) => item['clientId'] === one);
          if (!found) return json({ statusCode: 404, message: 'Not found' }, 404);
          if (call.method === 'DELETE') return json(undefined, 200);
          if (call.method === 'PATCH') return json({ ...found, ...(body as object) });
          return json(found);
        }
        if (path === '/api/issuer/credentials') {
          return json([
            {
              id: 'membership',
              config: { format: 'dc+sd-jwt', display: [{ name: 'Membership' }] },
            },
            { id: 'pid', config: { format: 'dc+sd-jwt', display: [] } },
          ]);
        }
        if (path.startsWith('/api/config-bundles/resources/')) return json(ownership);
        return json([]);
      },
    });
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideTanStackQuery(new QueryClient({ defaultOptions: { queries: { retry: false } } })),
        { provide: SessionService, useValue: session },
        { provide: CallerService, useValue: { loadedCaller: caller.asReadonly() } },
        { provide: NotifyService, useValue: notify },
      ],
    });
  });

  afterEach(() => {
    client.setConfig({ fetch: () => new Promise<Response>(() => undefined) });
    document.body.innerHTML = '';
  });

  describe('list', () => {
    it('shows each client with its roles and marks the one the caller signed in with', async () => {
      const { settle } = await render(ClientList);
      await settle(() => expect(rows()).toHaveLength(3));
      expect(text(rows()[0])).toContain('acme-admin');
      expect(text(rows()[0])).toContain('You');
      expect(text(rows()[1])).toContain('issuance:offer');
    });

    it('locks a client with roles the caller neither holds nor may grant', async () => {
      const { settle } = await render(ClientList);
      await settle(() => expect(rows()).toHaveLength(3));
      expectUnavailable(
        labelled('Delete ops'),
        'This client has roles you neither hold nor may grant.'
      );
    });

    it('says when the identity provider manages the clients', async () => {
      clients = 'unavailable';
      const { settle } = await render(ClientList);
      await settle(() => expect(text()).toContain('Client management is unavailable'));
      expect(text()).toContain('The identity provider manages clients.');
      expect(button('Add client')).toBeUndefined();
    });

    it('replaces a secret after asking and shows the new one once', async () => {
      const { settle } = await render(ClientList);
      await settle(() => expect(rows()).toHaveLength(3));
      labelled('Replace the secret of crm').click();
      await settle(() => expect(button('Replace secret')).toBeDefined());
      button('Replace secret')!.click();
      await settle(() => expect(text()).toContain('n3w-secret'));
      expect(requests).toContainEqual(
        expect.objectContaining({ method: 'POST', path: '/api/client/crm/rotate-secret' })
      );
      expect(session.useRotatedSecret).not.toHaveBeenCalled();
    });

    it('signs out after deleting the client the caller signed in with', async () => {
      const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
      const { settle } = await render(ClientList);
      await settle(() => expect(rows()).toHaveLength(3));
      labelled('Delete acme-admin').click();
      await settle(() => expect(button('Delete client')).toBeDefined());
      expect(text()).toContain('You are signed in with this client.');
      button('Delete client')!.click();
      await settle(() => expect(navigate).toHaveBeenCalledWith(['/login']));
      expect(session.logout).toHaveBeenCalled();
    });
  });

  describe('detail', () => {
    it('shows the roles and the configurations the client is limited to', async () => {
      const { settle } = await render(ClientDetail, { id: 'crm' });
      await settle(() => expect(text()).toContain('Issues membership cards'));
      expect(text()).toContain('issuance:offer');
      expect(page().querySelector('a[href="/credential-config/membership"]')).not.toBeNull();
      expect(text()).toContain('All presentation configurations');
    });
  });

  describe('form', () => {
    it('adds a client with the chosen roles and shows its secret once', async () => {
      const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
      const { settle } = await render(ClientForm);
      await settle(() => expect(page().querySelector('#limit-issuance-pid')).not.toBeNull());

      button('Add client')!.click();
      await settle(() =>
        expect(notify.error).toHaveBeenCalledWith('Check the highlighted fields.')
      );
      expect(text()).toContain('Choose at least one role.');

      type('client-id', 'orders');
      page().querySelector<HTMLButtonElement>('#role-issuance\\:offer')!.click();
      page().querySelector<HTMLButtonElement>('#limit-issuance-pid')!.click();
      await settle(() =>
        expect(page().querySelector('#role-issuance\\:offer')!.getAttribute('aria-checked')).toBe(
          'true'
        )
      );
      button('Add client')!.click();

      await settle(() => expect(text()).toContain('s3cret-once'));
      expect(requests).toContainEqual({
        method: 'POST',
        path: '/api/client',
        body: {
          clientId: 'orders',
          roles: ['issuance:offer'],
          allowedPresentationConfigs: [],
          allowedIssuanceConfigs: ['pid'],
        },
      });
      button('I saved the secret')!.click();
      await settle(() => expect(navigate).toHaveBeenCalledWith(['/clients', 'orders']));
    });

    it('keeps the client ID and sends only the changes when editing', async () => {
      vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
      const { settle } = await render(ClientForm, { id: 'crm' });
      await settle(() =>
        expect(page().querySelector<HTMLInputElement>('#client-id')!.value).toBe('crm')
      );
      expect(page().querySelector<HTMLInputElement>('#client-id')!.disabled).toBe(true);
      type('client-description', 'Sends membership offers');
      button('Save client')!.click();
      await settle(() => expect(notify.success).toHaveBeenCalledWith('Client crm saved.'));
      expect(requests).toContainEqual({
        method: 'PATCH',
        path: '/api/client/crm',
        body: {
          description: 'Sends membership offers',
          roles: ['issuance:offer'],
          allowedPresentationConfigs: [],
          allowedIssuanceConfigs: ['membership'],
        },
      });
    });

    it('cannot change a client with roles the caller may not grant', async () => {
      const { settle } = await render(ClientForm, { id: 'ops' });
      await settle(() => expect(text()).toContain('You cannot change this client'));
      expectUnavailable(
        button('Save client')!,
        'You cannot change this client: it has roles you neither hold nor may grant.'
      );
    });
  });
});
