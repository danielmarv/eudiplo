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
import { StatusListCreate } from './status-list-create';
import { StatusListDetail } from './status-list-detail';
import { StatusListList } from './status-list-list';
import { StatusListSettings } from './status-list-settings';

describe('status list pages', () => {
  const hour = 3_600_000;
  let lists: Record<string, unknown>[] | 'fail';
  let config: Record<string, unknown>;
  let ownership: unknown[];
  let requests: { method: string; path: string; body?: unknown }[];
  let notify: Record<'success' | 'info' | 'warning' | 'error', ReturnType<typeof vi.fn>>;
  const caller = signal<Caller | undefined>(undefined);

  const json = (body: unknown, status = 200) =>
    new Response(body === undefined ? null : JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });

  const statusList = (id: string, extra: Record<string, unknown> = {}) => ({
    id,
    tenantId: 'acme',
    bits: 1,
    capacity: 10_000,
    usedEntries: 0,
    availableEntries: 10_000,
    uri: `https://issuer.example/acme/status-management/status-list/${id}`,
    createdAt: '2026-10-01T08:00:00Z',
    expiresAt: null,
    ...extra,
  });

  const page = () => document.body;
  const text = (element: Element | null = page()) =>
    element?.textContent?.replace(/\s+/g, ' ') ?? '';
  const rows = () => [...page().querySelectorAll('tbody tr')];
  const button = (name: string) =>
    [...page().querySelectorAll<HTMLButtonElement>('button')].find(
      (candidate) => candidate.textContent?.trim() === name
    );
  const select = (id: string) => page().querySelector<HTMLSelectElement>(`#${id}`)!;
  const choose = (id: string, value: string) => {
    select(id).value = value;
    select(id).dispatchEvent(new Event('change'));
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
    lists = [
      statusList('alpha', {
        credentialConfigurationId: 'student-id',
        usedEntries: 9_500,
        availableEntries: 500,
        expiresAt: new Date(Date.now() + 24 * hour).toISOString(),
      }),
      statusList('beta', { keyChainId: 'status-signer', bits: 2 }),
    ];
    config = {};
    ownership = [];
    requests = [];
    notify = { success: vi.fn(), info: vi.fn(), warning: vi.fn(), error: vi.fn() };
    caller.set({ subject: 'acme-admin', tenantId: 'acme', roles: ['issuance:manage'] });
    client.setConfig({
      baseUrl: 'http://backend.test',
      fetch: async (request: RequestInfo | URL) => {
        const call = request instanceof Request ? request : new Request(String(request));
        const path = new URL(call.url).pathname;
        const body = ['POST', 'PUT', 'PATCH'].includes(call.method)
          ? await call.clone().json()
          : undefined;
        requests.push({ method: call.method, path, body });
        const all = lists === 'fail' ? [] : lists;
        if (path === '/api/status-lists') {
          if (call.method === 'POST')
            return json(statusList('gamma', body as Record<string, unknown>), 201);
          return lists === 'fail' ? json({ message: 'Service Unavailable' }, 503) : json(lists);
        }
        const one = /^\/api\/status-lists\/(.+)$/.exec(path)?.[1];
        if (one) {
          const found = all.find((list) => list['id'] === one);
          if (!found) {
            return json({ statusCode: 404, message: `Status list ${one} not found` }, 404);
          }
          if (call.method === 'DELETE') {
            lists = all.filter((list) => list !== found);
            return json(undefined);
          }
          if (call.method === 'PATCH') return json({ ...found, ...(body as object) });
          return json(found);
        }
        if (path === '/api/status-list-config') {
          if (call.method === 'PUT') return json(body);
          if (call.method === 'DELETE') return json(undefined);
          return json(config);
        }
        if (path.startsWith('/api/config-bundles/resources/')) return json(ownership);
        if (path === '/api/issuer/credentials') {
          return json([
            {
              id: 'student-id',
              config: { format: 'dc+sd-jwt', display: [{ name: 'Student ID' }] },
            },
          ]);
        }
        if (path === '/api/key-chain') {
          return json([
            { id: 'status-signer', usageType: 'statusList', description: 'Status signer' },
            { id: 'access', usageType: 'access' },
          ]);
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
      ],
    });
  });

  afterEach(() => {
    client.setConfig({ fetch: () => new Promise<Response>(() => undefined) });
    document.body.innerHTML = '';
  });

  describe('list', () => {
    it('shows what each list serves, how full it is and whether its signed copy is current', async () => {
      await render(StatusListList);

      expect(rows()).toHaveLength(2);
      const [alpha, beta] = rows().map((row) => text(row));
      expect(alpha).toContain('student-id');
      expect(alpha).toContain('9.5K of 10K');
      expect(alpha).toContain('95%');
      expect(alpha).toContain('Valid');
      expect(beta).toContain('Shared');
      expect(beta).toContain('status-signer');
      expect(beta).toContain('Not signed yet');
      expect(text()).toContain('9,500 of 20,000 entries used');
    });

    it('lets a list no credential uses be deleted, and says why another cannot be', async () => {
      const { settle } = await render(StatusListList);

      expectUnavailable(
        page().querySelector<HTMLButtonElement>('button[aria-label="Delete alpha"]')!,
        'Credentials use it, so it cannot be deleted'
      );
      page().querySelector<HTMLButtonElement>('button[aria-label="Delete beta"]')!.click();
      await settle(() => expect(button('Delete status list')).toBeDefined());
      button('Delete status list')!.click();
      await settle(() => expect(rows()).toHaveLength(1));
      expect(requests).toContainEqual({ method: 'DELETE', path: '/api/status-lists/beta' });
      expect(notify.success).toHaveBeenCalledWith('Status list deleted.');
    });

    it('keeps a list that a file provisioned from being deleted here', async () => {
      ownership = [
        {
          kind: 'StatusList',
          resourceId: 'beta',
          ownership: 'file-managed',
          source: 'folder:acme',
        },
      ];
      const { settle } = await render(StatusListList);

      await settle(() =>
        expectUnavailable(
          page().querySelector<HTMLButtonElement>('button[aria-label="Delete beta"]')!,
          'Managed by folder:acme, read-only'
        )
      );
    });

    it('finds a list by its credential type or key chain', async () => {
      const { settle } = await render(StatusListList);
      const search = page().querySelector<HTMLInputElement>('input[type="search"]')!;

      search.value = 'signer';
      search.dispatchEvent(new Event('input'));
      await settle(() =>
        expect(rows().map((row) => row.querySelector('a')?.textContent)).toEqual(['beta'])
      );
    });

    it('offers to create the first list, and says why the lists could not be loaded', async () => {
      lists = [];
      await render(StatusListList);
      expect(text()).toContain('No status lists yet');

      document.body.innerHTML = '';
      lists = 'fail';
      TestBed.inject(QueryClient).clear();
      await render(StatusListList);
      expect(text()).toContain('The status lists could not be loaded');
      expect(text()).toContain('Service Unavailable');
    });
  });

  describe('create', () => {
    it('creates a list bound as chosen, with the size given, and opens it', async () => {
      const { settle } = await render(StatusListCreate);
      const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
      await settle(() => expect(select('binding-credential').options).toHaveLength(2));

      choose('binding-credential', 'student-id');
      choose('binding-key-chain', 'status-signer');
      choose('list-bits', '2');
      button('100K')!.click();
      button('Create status list')!.click();

      await settle(() => expect(navigate).toHaveBeenCalledWith(['/status-lists', 'gamma']));
      expect(requests.find((call) => call.method === 'POST')?.body).toEqual({
        credentialConfigurationId: 'student-id',
        keyChainId: 'status-signer',
        bits: 2,
        capacity: 100_000,
      });
      // Only key chains that can sign a status list are offered.
      expect([...select('binding-key-chain').options].map((option) => option.value)).toEqual([
        '',
        'status-signer',
      ]);
    });

    it('sends nothing the user left to the defaults, and names the tenant default', async () => {
      config = { capacity: 50_000 };
      const { settle } = await render(StatusListCreate);
      await settle(() =>
        expect(page().querySelector<HTMLInputElement>('#list-capacity')!.placeholder).toBe(
          'Tenant default: 50,000'
        )
      );

      button('Create status list')!.click();
      await settle(() => expect(notify.success).toHaveBeenCalledWith('Status list created.'));
      expect(requests.find((call) => call.method === 'POST')?.body).toEqual({});
    });

    it('refuses a size outside the backend limits', async () => {
      const { settle } = await render(StatusListCreate);
      const capacity = page().querySelector<HTMLInputElement>('#list-capacity')!;

      capacity.value = '500';
      capacity.dispatchEvent(new Event('input'));
      button('Create status list')!.click();
      await settle(() => expect(text()).toContain('Enter at least 1,000.'));
      expect(requests.some((call) => call.method === 'POST')).toBe(false);
    });
  });

  describe('detail', () => {
    it('shows the list, and removes a binding by choosing none', async () => {
      const { settle } = await render(StatusListDetail, { listId: 'alpha' });
      await settle(() => expect(select('binding-credential').value).toBe('student-id'));

      expect(text()).toContain('alpha');
      expect(text()).toContain('9,500');
      expect(text(page().querySelector('[data-testid="token-state"]'))).toContain('Valid');
      expectUnavailable(button('Delete')!, 'Credentials use it, so it cannot be deleted');

      choose('binding-credential', '');
      button('Save changes')!.click();
      await settle(() => expect(notify.success).toHaveBeenCalledWith('Status list saved.'));
      expect(requests.find((call) => call.method === 'PATCH')).toEqual({
        method: 'PATCH',
        path: '/api/status-lists/alpha',
        body: { credentialConfigurationId: null },
      });
    });

    it('says that a new key chain signs the list from its next request', async () => {
      const { settle } = await render(StatusListDetail, { listId: 'beta' });
      await settle(() => expect(select('binding-key-chain').value).toBe('status-signer'));

      choose('binding-key-chain', '');
      button('Save changes')!.click();
      await settle(() =>
        expect(notify.success).toHaveBeenCalledWith(
          'Status list saved. It is signed with the new key chain on its next request.'
        )
      );
    });

    it('keeps a list that a file provisioned from being changed here', async () => {
      ownership = [
        {
          kind: 'StatusList',
          resourceId: 'beta',
          ownership: 'file-managed',
          generation: 1,
          source: 'folder:acme/status.json',
        },
      ];
      const { settle } = await render(StatusListDetail, { listId: 'beta' });
      await settle(() => expect(text()).toContain('Managed by a configuration bundle'));

      expectUnavailable(button('Save changes')!, 'Managed by folder:acme/status.json, read-only');
      expectUnavailable(button('Delete')!, 'Managed by folder:acme/status.json, read-only');
    });

    it('says when there is no such list', async () => {
      await render(StatusListDetail, { listId: 'missing' });

      expect(text()).toContain('There is no status list missing');
    });
  });

  describe('settings', () => {
    it('saves only the settings the tenant sets, and says how many it sets', async () => {
      config = { capacity: 5_000 };
      const { settle } = await render(StatusListSettings);
      await settle(() =>
        expect(page().querySelector<HTMLInputElement>('#setting-capacity')!.value).toBe('5000')
      );
      expect(text(page().querySelector('[data-testid="stored"]'))).toContain('sets 1 of 5');

      choose('setting-republish', 'yes');
      button('Save settings')!.click();
      await settle(() =>
        expect(notify.success).toHaveBeenCalledWith('Status list settings saved.')
      );
      expect(requests.find((call) => call.method === 'PUT')?.body).toEqual({
        capacity: 5_000,
        immediateUpdate: true,
      });
      await settle(() =>
        expect(text(page().querySelector('[data-testid="stored"]'))).toContain('sets 2 of 5')
      );
    });

    it('resets to the instance defaults after saying what changes', async () => {
      config = { bits: 2 };
      const { settle } = await render(StatusListSettings);

      button('Reset to instance defaults')!.click();
      await settle(() =>
        expect(text()).toContain(
          'This removes 2 bits per status. Afterwards new status lists follow STATUS_BITS'
        )
      );
      button('Reset settings')!.click();
      await settle(() =>
        expect(text(page().querySelector('[data-testid="stored"]'))).toContain(
          "follows the instance's defaults"
        )
      );
      expect(requests).toContainEqual({ method: 'DELETE', path: '/api/status-list-config' });
      expect(button('Reset to instance defaults')).toBeUndefined();
    });

    it('keeps settings that a file provisioned from being changed here', async () => {
      ownership = [
        {
          kind: 'Tenant',
          resourceId: 'tenant',
          ownership: 'file-managed',
          generation: 1,
          source: 'folder:acme/info.json',
        },
      ];
      const { settle } = await render(StatusListSettings);
      await settle(() => expect(text()).toContain('Managed by a configuration bundle'));

      expectUnavailable(button('Save settings')!, 'Managed by folder:acme/info.json, read-only');
    });
  });
});
