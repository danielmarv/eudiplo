import { signal, type Type } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { client } from '@eudiplo/sdk-core';
import { provideTanStackQuery, QueryClient } from '@tanstack/angular-query-experimental';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type Caller, CallerService } from '../../../core/auth/caller.service';
import { SessionService } from '../../../core/auth/session.service';
import { NotifyService } from '../../../core/notify/notify.service';
import { ConfigDocumentService } from '../../../shared/config-ownership/config-document.service';
import { TrustListDetail } from './trust-list-detail';
import { TrustListForm } from './trust-list-form';
import { TrustListList } from './trust-list-list';

describe('trust list pages', () => {
  let lists: Record<string, unknown>[];
  let current: Record<string, unknown>;
  let ownership: unknown[];
  let failList: boolean;
  let requests: { method: string; path: string; body?: unknown }[];
  let notify: Record<'success' | 'info' | 'warning' | 'error', ReturnType<typeof vi.fn>>;
  const caller = signal<Caller | undefined>(undefined);

  const json = (body: unknown, status = 200) =>
    new Response(body === undefined || status === 204 ? null : JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });
  const list = (id: string, extra: Record<string, unknown> = {}) => ({
    id,
    tenantId: 'acme',
    description: `${id} issuer trust list`,
    keyChainId: 'trust-signer',
    sequenceNumber: 2,
    createdAt: '2026-10-01T08:00:00Z',
    updatedAt: '2026-10-02T08:00:00Z',
    entityConfig: [],
    ...extra,
  });
  const page = () => document.body;
  const text = (element: Element | null = page()) =>
    element?.textContent?.replace(/\s+/g, ' ') ?? '';
  const rows = () => [...page().querySelectorAll('tbody tr')];
  const button = (label: string) =>
    [...page().querySelectorAll<HTMLButtonElement>('button')].find(
      (candidate) =>
        candidate.getAttribute('aria-label') === label || candidate.textContent?.trim() === label
    );

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
    lists = [list('alpha'), list('beta', { description: 'Wallet issuers' })];
    current = list('alpha', {
      entityConfig: [
        {
          type: 'internal',
          issuerKeyChainId: 'issuer-keys',
          revocationKeyChainId: 'status-keys',
          info: {
            name: 'Example issuer',
            contactUri: 'info@example.com',
            website: 'https://example.com/',
          },
        },
      ],
    });
    ownership = [];
    failList = false;
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
        const body = ['POST', 'PUT', 'PATCH'].includes(call.method)
          ? await call.clone().json()
          : undefined;
        requests.push({ method: call.method, path, body });
        if (path === '/api/frontend-config') return json({ publicUrl: 'https://public.example' });
        if (path.startsWith('/api/config-bundles/resources/')) return json(ownership);
        if (path === '/api/key-chain') {
          return json([
            { id: 'trust-signer', usageType: 'trustList', description: 'Trust signer' },
            { id: 'issuer-keys', usageType: 'attestation', description: 'Issuer keys' },
            { id: 'status-keys', usageType: 'statusList', description: 'Status keys' },
          ]);
        }
        if (path === '/api/issuer/credentials') {
          return json([
            {
              id: 'membership',
              description: 'Membership',
              schemaMeta: { trustedAuthorities: [{ trustListId: 'alpha' }] },
            },
          ]);
        }
        if (path === '/api/verifier/config') {
          return json([
            {
              id: 'member-check',
              description: 'Member check',
              dcql_query: {
                credentials: [
                  {
                    trusted_authorities: [{ type: 'etsi_tl', values: [{ trustListId: 'alpha' }] }],
                  },
                ],
              },
            },
          ]);
        }
        if (path === '/api/trust-list') {
          if (call.method === 'POST') {
            const created = list('new-list', body as Record<string, unknown>);
            lists = [...lists, created];
            current = created;
            return json(created, 201);
          }
          return failList ? json({ statusCode: 503, message: 'Unavailable' }, 503) : json(lists);
        }
        const version = /^\/api\/trust-list\/([^/]+)\/versions$/.exec(path)?.[1];
        if (version)
          return json([{ id: 'v1', sequenceNumber: 1, createdAt: '2026-09-01T08:00:00Z' }]);
        const id = /^\/api\/trust-list\/([^/]+)$/.exec(path)?.[1];
        if (id) {
          if (!current || current['id'] !== id)
            return json({ statusCode: 404, message: 'Not found' }, 404);
          if (call.method === 'PUT') {
            current = { ...current, ...(body as Record<string, unknown>) };
            return json(current);
          }
          if (call.method === 'DELETE') {
            lists = lists.filter((item) => item['id'] !== id);
            return json(undefined, 204);
          }
          return json(current);
        }
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
        {
          provide: ConfigDocumentService,
          useValue: {
            canDownload: () => true,
            isDownloading: () => false,
            download: vi.fn(),
          },
        },
      ],
    });
  });

  afterEach(() => {
    client.setConfig({ fetch: () => new Promise<Response>(() => undefined) });
    document.body.innerHTML = '';
  });

  it('lists trust lists with search, explicit empty and error states, and ownership-aware edit actions', async () => {
    ownership = [
      { kind: 'TrustList', resourceId: 'beta', ownership: 'file-managed', source: 'folder:acme' },
    ];
    const { settle } = await render(TrustListList);
    await settle(() => expect(rows()).toHaveLength(2));
    expect(page().querySelector('a[href="/alpha/edit"]')).not.toBeNull();
    expect(
      page()
        .querySelector<HTMLButtonElement>('button[aria-label="Edit trust list beta"]')
        ?.getAttribute('aria-disabled')
    ).toBe('true');

    const search = page().querySelector<HTMLInputElement>('input[type="search"]')!;
    search.value = 'wallet';
    search.dispatchEvent(new Event('input'));
    await settle(() => expect(rows()).toHaveLength(1));
    expect(text(rows()[0])).toContain('beta');

    document.body.innerHTML = '';
    lists = [];
    TestBed.inject(QueryClient).clear();
    await render(TrustListList);
    expect(text()).toContain('No trust lists yet');

    document.body.innerHTML = '';
    failList = true;
    TestBed.inject(QueryClient).clear();
    await render(TrustListList);
    expect(text()).toContain('The trust lists could not be loaded');
  });

  it('shows public URL, version and references, and blocks delete while a visible config refers to it', async () => {
    const { settle } = await render(TrustListDetail, { id: 'alpha' });
    await settle(() =>
      expect(page().querySelector('a[href="/presentation-config/member-check"]')).not.toBeNull()
    );
    expect(text()).toContain('https://public.example/issuers/acme/trust-list/alpha');
    expect(text()).toContain('Version 1');
    expect(text()).toContain('Example issuer');

    button('Delete')!.click();
    expect(notify.error).toHaveBeenCalledWith(
      'Trust list "alpha issuer trust list" (alpha) is still referenced by 1 credential config and 1 presentation config. Remove these references before deleting it.'
    );
    expect(requests.some((request) => request.method === 'DELETE')).toBe(false);
  });

  it('deletes a list no visible configuration refers to, after asking in a dialog', async () => {
    current = list('beta', { description: 'Wallet issuers' });
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    const { settle } = await render(TrustListDetail, { id: 'beta' });
    await settle(() => expect(text()).toContain('Wallet issuers'));

    button('Delete')!.click();
    await settle(() => expect(button('Delete trust list')).toBeDefined());
    expect(text()).toContain('Configurations not visible here may still refer to it');
    button('Delete trust list')!.click();
    await settle(() => expect(navigate).toHaveBeenCalledWith(['/trust-list']));
    expect(requests).toContainEqual(
      expect.objectContaining({ method: 'DELETE', path: '/api/trust-list/beta' })
    );
  });

  it('creates a list with its trusted entities using the generated SDK and opens the new detail page', async () => {
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    const { settle } = await render(TrustListForm);
    const value = (name: string, content: string, row = 0) => {
      const field = page().querySelectorAll<HTMLInputElement | HTMLTextAreaElement>(
        `[formcontrolname="${name}"]`
      )[row];
      field.value = content;
      field.dispatchEvent(new Event('input'));
    };

    value('id', 'new-list');
    button('Add internal entity')!.click();
    await settle(() =>
      expect(page().querySelectorAll('[formcontrolname="infoName"]')).toHaveLength(1)
    );

    value('infoName', 'Example issuer');
    value('infoContactUri', 'info@example.com');
    value('infoWebsite', 'https://example.com/');
    await settle(() => expect(page().querySelector('option[value="trust-signer"]')).not.toBeNull());
    const setSelect = (name: string, selected: string) => {
      const field = page().querySelector<HTMLSelectElement>(`select[formcontrolname="${name}"]`)!;
      field.value = selected;
      field.dispatchEvent(new Event('change'));
    };
    setSelect('keyChainId', 'trust-signer');
    setSelect('issuerKeyChainId', 'issuer-keys');
    setSelect('revocationKeyChainId', 'status-keys');

    page().querySelector<HTMLButtonElement>('button[type="submit"]')!.click();
    await settle(() => expect(navigate).toHaveBeenCalledWith(['/trust-list', 'new-list']));

    const create = requests.find(
      (request) => request.method === 'POST' && request.path === '/api/trust-list'
    );
    expect(create?.body).toMatchObject({
      id: 'new-list',
      entities: [
        {
          type: 'internal',
          issuerKeyChainId: 'issuer-keys',
          revocationKeyChainId: 'status-keys',
          info: {
            name: 'Example issuer',
            contactUri: 'info@example.com',
            website: 'https://example.com/',
          },
        },
      ],
    });
  });

  it('loads the edit form only after the list is available and respects file ownership', async () => {
    ownership = [
      { kind: 'TrustList', resourceId: 'alpha', ownership: 'file-managed', source: 'bundle:demo' },
    ];
    const { settle } = await render(TrustListForm, { id: 'alpha' });
    await settle(() => expect(text()).toContain('Managed by a configuration bundle'));
    expect(page().querySelector<HTMLInputElement>('[formcontrolname="id"]')?.readOnly).toBe(true);
    expect(page().querySelector('button[aria-disabled="true"]')).not.toBeNull();
    expect(requests.some((request) => request.method === 'PUT')).toBe(false);
  });
});
