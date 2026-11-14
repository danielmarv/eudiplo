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
import { FederationTrustAnchorDetail } from './federation-trust-anchor-detail';
import { FederationTrustAnchorFormPage } from './federation-trust-anchor-form';
import { FederationTrustAnchorList } from './federation-trust-anchor-list';

describe('federation trust anchor pages', () => {
  let anchors: Record<string, unknown>[] | 'fail';
  let ownership: unknown[];
  let issuance: Record<string, unknown>;
  let presentations: Record<string, unknown>[];
  let requests: { method: string; path: string; body?: unknown }[];
  let notify: Record<'success' | 'info' | 'warning' | 'error', ReturnType<typeof vi.fn>>;
  const caller = signal<Caller | undefined>(undefined);

  const anchor = (extra: Record<string, unknown> = {}) => ({
    id: 'eu-federation',
    tenantId: 'acme',
    entityId: 'https://anchor.example',
    description: 'EU federation',
    jwks: { keys: [{ kty: 'EC', kid: 'federation-1', crv: 'P-256', x: 'x', y: 'y' }] },
    ...extra,
  });
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
  const setField = (id: string, value: string) => {
    const field = page().querySelector<HTMLInputElement | HTMLTextAreaElement>(`#${id}`)!;
    field.value = value;
    field.dispatchEvent(new Event('input'));
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
    return { fixture, settle };
  }

  beforeEach(() => {
    anchors = [anchor()];
    ownership = [];
    issuance = { federation: { trustAnchors: [] } };
    presentations = [];
    requests = [];
    notify = { success: vi.fn(), info: vi.fn(), warning: vi.fn(), error: vi.fn() };
    caller.set({ subject: 'acme-admin', tenantId: 'acme', roles: ['issuance:manage'] });
    client.setConfig({
      baseUrl: 'http://backend.test',
      fetch: async (requestInfo: RequestInfo | URL) => {
        const request =
          requestInfo instanceof Request ? requestInfo : new Request(String(requestInfo));
        const path = new URL(request.url).pathname;
        const body = ['POST', 'PATCH'].includes(request.method)
          ? await request.clone().json()
          : undefined;
        requests.push({ method: request.method, path, body });

        if (path === '/api/federation-trust-anchor') {
          if (request.method === 'POST') return json(anchor(body as Record<string, unknown>), 201);
          return anchors === 'fail'
            ? json({ statusCode: 503, message: 'Service unavailable' }, 503)
            : json(anchors);
        }
        const id = /^\/api\/federation-trust-anchor\/(.+)$/.exec(path)?.[1];
        if (id) {
          const found = anchors === 'fail' ? undefined : anchors.find((item) => item['id'] === id);
          if (!found) return json({ statusCode: 404, message: 'Trust anchor not found' }, 404);
          if (request.method === 'PATCH') return json({ ...found, ...(body as object) });
          if (request.method === 'DELETE') {
            anchors = (anchors as Record<string, unknown>[]).filter((item) => item !== found);
            return json(undefined, 204);
          }
          return json(found);
        }
        if (path === '/api/config-bundles/resources/FederationTrustAnchor') return json(ownership);
        if (path === '/api/issuer/config') return json(issuance);
        if (path === '/api/verifier/config') return json(presentations);
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

  it('lists trust anchors with pinned key counts and shows explicit empty and failure states', async () => {
    const { fixture, settle } = await render(FederationTrustAnchorList);
    await settle(() => expect(rows()).toHaveLength(1));
    expect(text(rows()[0])).toContain('EU federation');
    expect(text(rows()[0])).toContain('https://anchor.example');
    expect(text(rows()[0])).toContain('1');

    fixture.destroy();
    document.body.innerHTML = '';
    anchors = [];
    TestBed.inject(QueryClient).clear();
    const empty = await render(FederationTrustAnchorList);
    await empty.settle(() => expect(text()).toContain('No federation trust anchors yet'));
    empty.fixture.destroy();

    document.body.innerHTML = '';
    anchors = 'fail';
    TestBed.inject(QueryClient).clear();
    const failure = await render(FederationTrustAnchorList);
    await failure.settle(() => expect(text()).toContain('could not be loaded'));
    expect(button('Retry')).toBeDefined();
  });

  it('keeps a file-managed anchor from being edited', async () => {
    ownership = [
      {
        kind: 'FederationTrustAnchor',
        resourceId: 'eu-federation',
        ownership: 'file-managed',
        source: 'folder:acme/federation.json',
      },
    ];
    const { settle } = await render(FederationTrustAnchorList);
    await settle(() =>
      expect(
        page()
          .querySelector<HTMLButtonElement>('button[aria-label="Edit trust anchor eu-federation"]')
          ?.getAttribute('aria-disabled')
      ).toBe('true')
    );

    expect(page().querySelector('a[href="/eu-federation/edit"]')).toBeNull();
    expectUnavailable(
      page().querySelector<HTMLButtonElement>(
        'button[aria-label="Edit trust anchor eu-federation"]'
      )!,
      'Managed by folder:acme/federation.json, read-only'
    );
  });

  it('registers a trust anchor through the generated API client and opens its detail page', async () => {
    const { fixture, settle } = await render(FederationTrustAnchorFormPage);
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    setField('federation-anchor-id', 'eu-federation');
    setField('federation-anchor-entity-id', 'https://anchor.example');
    setField(
      'federation-anchor-jwks',
      JSON.stringify({ keys: [{ kty: 'EC', kid: 'federation-1', crv: 'P-256', x: 'x', y: 'y' }] })
    );
    button('Register trust anchor')!.click();

    await settle(() =>
      expect(navigate).toHaveBeenCalledWith(['/federation-trust-anchor', 'eu-federation'])
    );
    expect(requests.find((request) => request.method === 'POST')).toEqual({
      method: 'POST',
      path: '/api/federation-trust-anchor',
      body: {
        id: 'eu-federation',
        entityId: 'https://anchor.example',
        description: null,
        jwks: { keys: [{ kty: 'EC', kid: 'federation-1', crv: 'P-256', x: 'x', y: 'y' }] },
      },
    });
    fixture.destroy();
  });

  it('updates an anchor and keeps its ID fixed', async () => {
    const { fixture, settle } = await render(FederationTrustAnchorFormPage, {
      id: 'eu-federation',
    });
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    await settle(() =>
      expect(page().querySelector<HTMLInputElement>('#federation-anchor-id')?.value).toBe(
        'eu-federation'
      )
    );
    const idField = page().querySelector<HTMLInputElement>('#federation-anchor-id')!;
    expect(idField.readOnly).toBe(true);
    setField('federation-anchor-description', 'Updated federation');
    button('Save changes')!.click();

    await settle(() =>
      expect(navigate).toHaveBeenCalledWith(['/federation-trust-anchor', 'eu-federation'])
    );
    expect(requests.find((request) => request.method === 'PATCH')).toMatchObject({
      method: 'PATCH',
      path: '/api/federation-trust-anchor/eu-federation',
      body: { description: 'Updated federation' },
    });
    fixture.destroy();
  });

  it('blocks an entity ID change when a visible configuration names the stored value', async () => {
    issuance = { federation: { trustAnchors: [{ entityId: 'https://anchor.example' }] } };
    const { settle } = await render(FederationTrustAnchorFormPage, { id: 'eu-federation' });
    await settle(() =>
      expect(page().querySelector<HTMLInputElement>('#federation-anchor-id')?.value).toBe(
        'eu-federation'
      )
    );
    setField('federation-anchor-entity-id', 'https://new-anchor.example');
    await settle(() => expect(text()).toContain('is named by the issuance configuration'));

    button('Save changes')!.click();
    await settle(() =>
      expect(notify.error).toHaveBeenCalledWith(expect.stringContaining('the change is refused'))
    );
    expect(requests.some((request) => request.method === 'PATCH')).toBe(false);
  });

  it('marks invalid fields and refuses private JWK material before sending', async () => {
    const { settle } = await render(FederationTrustAnchorFormPage);
    button('Register trust anchor')!.click();

    await settle(() =>
      expect(notify.error).toHaveBeenCalledWith(
        'Check the highlighted fields in Trust anchor, Federation keys.'
      )
    );
    expect(requests.some((request) => request.method === 'POST')).toBe(false);

    setField('federation-anchor-id', 'eu-federation');
    setField('federation-anchor-entity-id', 'https://anchor.example');
    setField(
      'federation-anchor-jwks',
      JSON.stringify({ keys: [{ kty: 'EC', kid: 'federation-1', d: 'private' }] })
    );
    button('Register trust anchor')!.click();
    await settle(() => expect(requests.some((request) => request.method === 'POST')).toBe(false));
    expect(text()).toContain('no private key material');
  });

  it('shows references and refuses a delete while a visible configuration names the anchor', async () => {
    issuance = { federation: { trustAnchors: [{ entityId: 'https://anchor.example' }] } };
    const { settle } = await render(FederationTrustAnchorDetail, { id: 'eu-federation' });
    await settle(() => expect(text()).toContain('Issuance configuration'));
    button('Delete')!.click();
    await settle(() =>
      expect(notify.error).toHaveBeenCalledWith(expect.stringContaining('still named by'))
    );
    expect(button('Delete trust anchor')).toBeUndefined();
    expect(requests.some((request) => request.method === 'DELETE')).toBe(false);
  });

  it('deletes an unreferenced anchor after confirmation and returns to the list', async () => {
    const { settle } = await render(FederationTrustAnchorDetail, { id: 'eu-federation' });
    await settle(() => expect(text()).toContain('Pinned federation keys'));
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);

    button('Delete')!.click();
    await settle(() => expect(button('Delete trust anchor')).toBeDefined());
    button('Delete trust anchor')!.click();
    await settle(() => expect(navigate).toHaveBeenCalledWith(['/federation-trust-anchor']));
    expect(requests.some((request) => request.method === 'DELETE')).toBe(true);
    expect(notify.success).toHaveBeenCalledWith('Trust anchor deleted.');
  });

  it('downloads the trust anchor as a configuration file', async () => {
    Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:anchor'), revokeObjectURL: vi.fn() });
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    const { settle } = await render(FederationTrustAnchorDetail, { id: 'eu-federation' });
    await settle(() => expect(text()).toContain('Pinned federation keys'));

    page().querySelector<HTMLButtonElement>('button[aria-label="Download configuration"]')!.click();
    await settle(() =>
      expect(requests.map((request) => request.path)).toContain(
        '/api/config-bundles/resources/FederationTrustAnchor/eu-federation/document'
      )
    );
  });
});
