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
import { WebhookEndpointDetail } from './webhook-endpoint-detail';
import { WebhookEndpointForm } from './webhook-endpoint-form';
import { WebhookEndpointList } from './webhook-endpoint-list';

describe('webhook endpoint pages', () => {
  let endpoints: Record<string, unknown>[] | 'fail';
  let ownership: unknown[];
  let requests: { method: string; path: string; body?: unknown }[];
  let notify: Record<'success' | 'info' | 'warning' | 'error', ReturnType<typeof vi.fn>>;
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
      (candidate) => candidate.textContent?.trim() === name
    );
  const field = (id: string) => page().querySelector<HTMLInputElement>(`#${id}`)!;
  const type = (id: string, value: string) => {
    field(id).value = value;
    field(id).dispatchEvent(new Event('input'));
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
    await settle(() => expect(page().querySelector('hlm-skeleton')).toBeNull());
    return { fixture, settle };
  }

  beforeEach(() => {
    endpoints = [
      {
        id: 'member-db',
        name: 'Member database',
        description: 'Members of Acme',
        url: 'https://members.acme.example/claims',
        auth: { type: 'apiKey', config: { headerName: 'X-Api-Key', value: '<redacted>' } },
      },
      { id: 'hr', name: 'HR system', url: 'https://hr.acme.example/eudi', auth: { type: 'none' } },
    ];
    ownership = [];
    requests = [];
    notify = { success: vi.fn(), info: vi.fn(), warning: vi.fn(), error: vi.fn() };
    caller.set({
      subject: 'acme-admin',
      tenantId: 'acme',
      roles: ['issuance:manage', 'presentation:manage'],
    });
    client.setConfig({
      baseUrl: 'http://backend.test',
      fetch: async (request: RequestInfo | URL) => {
        const call = request instanceof Request ? request : new Request(String(request));
        const path = new URL(call.url).pathname;
        const body = ['POST', 'PATCH'].includes(call.method)
          ? await call.clone().json()
          : undefined;
        requests.push({ method: call.method, path, body });
        const all = endpoints === 'fail' ? [] : endpoints;
        if (path === '/api/issuer/webhook-endpoints') {
          if (call.method === 'POST') return json(body, 201);
          return endpoints === 'fail' ? json({ message: 'Service Unavailable' }, 503) : json(all);
        }
        const one = /^\/api\/issuer\/webhook-endpoints\/(.+)$/.exec(path)?.[1];
        if (one) {
          const found = all.find((endpoint) => endpoint['id'] === one);
          if (!found) return json({ statusCode: 404, message: 'Not found' }, 404);
          if (call.method === 'DELETE') {
            endpoints = all.filter((endpoint) => endpoint !== found);
            return json(undefined, 200);
          }
          if (call.method === 'PATCH') return json({ ...found, ...(body as object) });
          return json(found);
        }
        if (path === '/api/issuer/credentials') {
          return json([
            {
              id: 'membership',
              webhookEndpointId: 'member-db',
              config: { format: 'dc+sd-jwt', display: [{ name: 'Membership card' }] },
            },
            { id: 'pid', config: { format: 'dc+sd-jwt', display: [] } },
          ]);
        }
        if (path === '/api/verifier/config') {
          return json([
            { id: 'age-check', description: 'Age check', webhookEndpointId: 'member-db' },
            { id: 'pid-login', dcql_query: { credentials: [] } },
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
        { provide: SessionService, useValue: { getBaseUrl: () => 'http://backend.test' } },
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
    it('shows where each endpoint is called, how it authenticates and who uses it', async () => {
      const { settle } = await render(WebhookEndpointList);
      await settle(() => expect(text(rows()[1])).toContain('membership'));

      const [hr, members] = rows().map((row) => text(row));
      expect(hr).toContain('HR system');
      expect(hr).toContain('hr.acme.example');
      expect(hr).toContain('None');
      expect(hr).toContain('No configuration');
      expect(members).toContain('API key in X-Api-Key');
      expect(page().querySelector('a[href="/credential-config/membership"]')).not.toBeNull();
      expect(page().querySelector('a[href="/presentation-config/age-check"]')).not.toBeNull();
    });

    it('says that an endpoint may be in use where the caller cannot look', async () => {
      caller.set({ subject: 'issuer', tenantId: 'acme', roles: ['issuance:manage'] });
      const { settle } = await render(WebhookEndpointList);
      await settle(() => expect(text(rows()[0])).toContain('None you can see'));
      expect(requests.some((call) => call.path === '/api/verifier/config')).toBe(false);
    });

    it('finds an endpoint by its URL', async () => {
      const { settle } = await render(WebhookEndpointList);
      const search = page().querySelector<HTMLInputElement>('input[type="search"]')!;

      search.value = 'members.acme';
      search.dispatchEvent(new Event('input'));
      await settle(() => expect(rows()).toHaveLength(1));
      expect(text(rows()[0])).toContain('Member database');
    });

    it('keeps an endpoint that a file provisioned from being edited here', async () => {
      ownership = [
        {
          kind: 'WebhookEndpoint',
          resourceId: 'hr',
          ownership: 'file-managed',
          source: 'folder:acme',
        },
      ];
      const { settle } = await render(WebhookEndpointList);

      await settle(() =>
        expect(
          page().querySelector('button[aria-label="Edit hr"]')?.getAttribute('aria-disabled')
        ).toBe('true')
      );
      expect(page().querySelector('a[href="/hr/edit"]')).toBeNull();
      expect(page().querySelector('a[href="/member-db/edit"]')).not.toBeNull();
    });

    it('offers to add the first endpoint, and says why the list could not be loaded', async () => {
      endpoints = [];
      await render(WebhookEndpointList);
      expect(text()).toContain('No webhook endpoints yet');

      document.body.innerHTML = '';
      endpoints = 'fail';
      TestBed.inject(QueryClient).clear();
      await render(WebhookEndpointList);
      expect(text()).toContain('The webhook endpoints could not be loaded');
    });
  });

  describe('detail', () => {
    it('shows the endpoint, the header but never the key, and who uses it', async () => {
      const { settle } = await render(WebhookEndpointDetail, { id: 'member-db' });
      await settle(() => expect(text()).toContain('Membership card'));

      expect(text()).toContain('Age check');
      expect(text()).toContain('https://members.acme.example/claims');
      expect(text()).toContain('X-Api-Key');
      expect(text()).not.toContain('<redacted>');
    });

    it('warns that deleting an endpoint in use loses the notifications of its configurations', async () => {
      const { settle } = await render(WebhookEndpointDetail, { id: 'member-db' });
      const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
      await settle(() => expect(text()).toContain('Membership card'));

      button('Delete')!.click();
      await settle(() =>
        expect(text()).toContain('2 configurations send notifications to it: membership, age-check')
      );
      button('Delete webhook endpoint')!.click();
      await settle(() => expect(navigate).toHaveBeenCalledWith(['/webhook-endpoints']));
      expect(requests).toContainEqual({
        method: 'DELETE',
        path: '/api/issuer/webhook-endpoints/member-db',
      });
    });

    it('keeps an endpoint that a file provisioned from being changed here', async () => {
      ownership = [
        {
          kind: 'WebhookEndpoint',
          resourceId: 'hr',
          ownership: 'file-managed',
          generation: 1,
          source: 'folder:acme/hr.json',
        },
      ];
      const { settle } = await render(WebhookEndpointDetail, { id: 'hr' });
      await settle(() => expect(text()).toContain('Managed by a configuration bundle'));

      expectUnavailable(button('Edit')!, 'Managed by folder:acme/hr.json, read-only');
      expectUnavailable(button('Delete')!, 'Managed by folder:acme/hr.json, read-only');
    });

    it('says when there is no such endpoint', async () => {
      await render(WebhookEndpointDetail, { id: 'missing' });

      expect(text()).toContain('There is no webhook endpoint missing');
    });
  });

  describe('form', () => {
    it('adds an endpoint with an API key, its ID following the name, and opens it', async () => {
      const { settle } = await render(WebhookEndpointForm);
      const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);

      type('endpoint-name', 'Loyalty Points');
      expect(field('endpoint-id').value).toBe('loyalty-points');
      type('endpoint-url', 'https://loyalty.example/claims');
      [...page().querySelectorAll('label')]
        .find((label) => label.textContent?.includes('API key'))!
        .querySelector<HTMLInputElement>('input[type="radio"]')!
        .click();
      await settle(() => expect(field('endpoint-key')).not.toBeNull());
      type('endpoint-key', 'example-secret');
      button('Add webhook endpoint')!.click();

      await settle(() =>
        expect(navigate).toHaveBeenCalledWith(['/webhook-endpoints', 'loyalty-points'])
      );
      expect(requests.find((call) => call.method === 'POST')?.body).toEqual({
        id: 'loyalty-points',
        name: 'Loyalty Points',
        url: 'https://loyalty.example/claims',
        auth: { type: 'apiKey', config: { headerName: 'X-API-Key', value: 'example-secret' } },
      });
    });

    it('says what is missing instead of sending it', async () => {
      const { settle } = await render(WebhookEndpointForm);

      button('Add webhook endpoint')!.click();
      await settle(() => expect(text()).toContain('Enter a name.'));
      expect(notify.error).toHaveBeenCalledWith('Check the highlighted fields in Endpoint.');
      expect(requests.some((call) => call.method === 'POST')).toBe(false);
    });

    it('keeps the stored key when editing, and asks for it again for a new URL', async () => {
      const { settle } = await render(WebhookEndpointForm, { id: 'member-db' });
      vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
      await settle(() => expect(field('endpoint-name').value).toBe('Member database'));

      expect(field('endpoint-id').readOnly).toBe(true);
      expect(field('endpoint-key').value).toBe('');
      expect(text()).toContain('A key is stored. Leave this empty to keep it');

      type('endpoint-url', 'https://new.acme.example/claims');
      button('Save changes')!.click();
      await settle(() =>
        expect(text()).toContain(
          'Enter the key again: the stored key is only kept for the same URL.'
        )
      );
      expect(requests.some((call) => call.method === 'PATCH')).toBe(false);

      type('endpoint-url', 'https://members.acme.example/claims');
      type('endpoint-name', 'Members');
      button('Save changes')!.click();
      await settle(() =>
        expect(notify.success).toHaveBeenCalledWith('Webhook endpoint Members saved.')
      );
      expect(requests.find((call) => call.method === 'PATCH')).toEqual({
        method: 'PATCH',
        path: '/api/issuer/webhook-endpoints/member-db',
        body: {
          name: 'Members',
          description: 'Members of Acme',
          url: 'https://members.acme.example/claims',
          auth: { type: 'apiKey', config: { headerName: 'X-Api-Key', value: '<redacted>' } },
        },
      });
    });

    it('edits the endpoint as JSON and says what is wrong with it', async () => {
      const { settle } = await render(WebhookEndpointForm, { id: 'hr' });
      await settle(() => expect(field('endpoint-name').value).toBe('HR system'));

      button('Edit as JSON')!.click();
      await settle(() => expect(page().querySelector('#endpoint-json')).not.toBeNull());
      const editor = page().querySelector<HTMLTextAreaElement>('#endpoint-json')!;
      expect(JSON.parse(editor.value)).toMatchObject({ name: 'HR system', auth: { type: 'none' } });

      editor.value = '{ nope';
      editor.dispatchEvent(new Event('input'));
      button('Use this JSON')!.click();
      await settle(() => expect(text()).toContain('This is not valid JSON'));

      editor.value = JSON.stringify({ name: 'People system', url: 'https://hr.acme.example/v2' });
      editor.dispatchEvent(new Event('input'));
      button('Use this JSON')!.click();
      await settle(() => expect(field('endpoint-name').value).toBe('People system'));
      expect(field('endpoint-url').value).toBe('https://hr.acme.example/v2');
    });

    it('keeps an endpoint that a file provisioned from being saved here', async () => {
      ownership = [
        {
          kind: 'WebhookEndpoint',
          resourceId: 'hr',
          ownership: 'file-managed',
          generation: 1,
          source: 'folder:acme/hr.json',
        },
      ];
      const { settle } = await render(WebhookEndpointForm, { id: 'hr' });
      await settle(() => expect(text()).toContain('Managed by a configuration bundle'));

      expectUnavailable(button('Save changes')!, 'Managed by folder:acme/hr.json, read-only');
    });
  });
});
