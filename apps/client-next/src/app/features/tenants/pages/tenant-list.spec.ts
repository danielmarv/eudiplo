import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { client } from '@eudiplo/sdk-core';
import { provideTanStackQuery, QueryClient } from '@tanstack/angular-query-experimental';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SessionService } from '../../../core/auth/session.service';
import { NotifyService } from '../../../core/notify/notify.service';
import { TenantList } from './tenant-list';

describe('TenantList', () => {
  /** The requests the page made, as "METHOD /path". */
  let requests: string[];
  let tenants: unknown[];
  let failList: boolean;
  let notify: { success: ReturnType<typeof vi.fn>; error: ReturnType<typeof vi.fn> };

  const json = (body: unknown, status = 200) =>
    new Response(status === 204 ? null : JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });

  const page = () => document.body;
  const rows = () => [...page().querySelectorAll('tbody tr')];
  /** The foot of the list, with the range it shows and the page buttons. */
  const footer = () =>
    page().querySelector('app-table-pagination')?.textContent?.replace(/\s+/g, ' ') ?? '';
  const names = () => rows().map((row) => row.querySelector('a')?.textContent?.trim());
  const many = (count: number) =>
    Array.from({ length: count }, (_, index) => ({
      id: `tenant-${String(index + 1).padStart(2, '0')}`,
      name: `Tenant ${String(index + 1).padStart(2, '0')}`,
      status: 'active',
    }));
  const button = (name: string) =>
    [...page().querySelectorAll<HTMLButtonElement>('button')].find(
      (candidate) =>
        candidate.getAttribute('aria-label') === name || candidate.textContent?.trim() === name
    );

  async function render() {
    const fixture = TestBed.createComponent(TenantList);
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
    failList = false;
    tenants = [
      { id: 'acme', name: 'Acme University', description: 'Issues student IDs', status: 'active' },
      { id: 'museum', name: 'City Museum', description: 'Verifies student status', status: null },
    ];
    notify = { success: vi.fn(), error: vi.fn() };
    client.setConfig({
      baseUrl: 'http://backend.test',
      fetch: async (request: RequestInfo | URL) => {
        const req = request instanceof Request ? request : new Request(String(request));
        const path = new URL(req.url).pathname;
        requests.push(`${req.method} ${path}`);
        if (req.method === 'DELETE') {
          tenants = tenants.filter(
            (tenant) => `/api/tenant/${(tenant as { id: string }).id}` !== path
          );
          return json(null, 204);
        }
        if (failList) return json({ statusCode: 503, message: 'Service Unavailable' }, 503);
        return json(tenants);
      },
    });
    TestBed.configureTestingModule({
      imports: [TenantList],
      providers: [
        provideRouter([]),
        provideTanStackQuery(new QueryClient({ defaultOptions: { queries: { retry: false } } })),
        { provide: SessionService, useValue: { getBaseUrl: () => 'http://backend.test' } },
        { provide: NotifyService, useValue: notify },
      ],
    });
  });

  afterEach(() => {
    client.setConfig({ fetch: () => new Promise<Response>(() => undefined) });
    document.body.innerHTML = '';
  });

  it('lists the tenants with their status', async () => {
    await render();

    expect(rows()).toHaveLength(2);
    expect(rows()[0].textContent).toContain('Acme University');
    expect(rows()[0].textContent).toContain('Active');
    expect(rows()[1].textContent).toContain('Not set up');
    expect(footer()).toContain('1–2 of 2 tenants');
  });

  it('finds tenants by name, ID or description, and says when none matches', async () => {
    const { settle } = await render();
    const search = page().querySelector<HTMLInputElement>('input[type="search"]')!;

    search.value = 'student status';
    search.dispatchEvent(new Event('input'));
    await settle(() => expect(rows()).toHaveLength(1));
    expect(rows()[0].textContent).toContain('City Museum');
    expect(footer()).toContain('1–1 of 1 tenant');

    search.value = 'nothing like this';
    search.dispatchEvent(new Event('input'));
    await settle(() => expect(page().textContent).toContain('No tenant matches'));

    button('Clear filters')!.click();
    await settle(() => expect(rows()).toHaveLength(2));
  });

  it('offers to add the first tenant when there is none', async () => {
    tenants = [];
    await render();

    expect(page().textContent).toContain('No tenants yet');
    expect(page().querySelector('a[href="/create"]')).not.toBeNull();
  });

  it('says why the list could not be loaded and loads it again on Retry', async () => {
    failList = true;
    const { settle } = await render();

    expect(page().textContent).toContain('The tenants could not be loaded');
    expect(page().textContent).toContain('Service Unavailable');

    failList = false;
    button('Retry')!.click();
    await settle(() => expect(rows()).toHaveLength(2));
  });

  it('deletes a tenant only after the confirmation, and removes it from the list', async () => {
    const { settle } = await render();

    button('Delete tenant Acme University')!.click();
    await settle(() => expect(page().textContent).toContain('Delete tenant Acme University?'));
    expect(requests).not.toContain('DELETE /api/tenant/acme');

    button('Delete tenant')!.click();
    await settle(() => expect(rows()).toHaveLength(1));
    expect(requests).toContain('DELETE /api/tenant/acme');
    expect(rows()[0].textContent).toContain('City Museum');
    expect(notify.success).toHaveBeenCalledWith('Tenant Acme University deleted.');
  });

  it('keeps the tenant when the confirmation is cancelled', async () => {
    const { settle } = await render();

    button('Delete tenant City Museum')!.click();
    await settle(() => expect(page().textContent).toContain('Delete tenant City Museum?'));
    button('Cancel')!.click();
    await settle(() => expect(page().textContent).not.toContain('Delete tenant City Museum?'));

    expect(requests.some((request) => request.startsWith('DELETE'))).toBe(false);
    expect(rows()).toHaveLength(2);
  });

  it('filters by status, with the number of tenants each status has', async () => {
    const { settle } = await render();

    const notSetUp = [...page().querySelectorAll('button[aria-pressed]')].find((candidate) =>
      candidate.textContent?.includes('Not set up')
    ) as HTMLButtonElement;
    expect(notSetUp.textContent?.replace(/\s+/g, ' ').trim()).toBe('Not set up 1');

    notSetUp.click();
    await settle(() => expect(rows()).toHaveLength(1));
    expect(names()).toEqual(['City Museum']);
    expect(notSetUp.getAttribute('aria-pressed')).toBe('true');
  });

  it('sorts by name, and reverses the order on a second click', async () => {
    const { settle } = await render();
    const header = () => page().querySelector('th[aria-sort]')!;

    expect(names()).toEqual(['Acme University', 'City Museum']);
    expect(header().getAttribute('aria-sort')).toBe('ascending');

    button('Tenant')!.click();
    await settle(() => expect(names()).toEqual(['City Museum', 'Acme University']));
    expect(header().getAttribute('aria-sort')).toBe('descending');
  });

  it('shows the tenants a page at a time', async () => {
    tenants = many(23);
    const { settle } = await render();

    expect(rows()).toHaveLength(10);
    expect(footer()).toContain('1–10 of 23 tenants');
    expect(footer()).toContain('Page 1 of 3');
    expect(button('Previous page')!.disabled).toBe(true);

    button('Next page')!.click();
    await settle(() => expect(footer()).toContain('11–20 of 23 tenants'));
    expect(names()[0]).toBe('Tenant 11');

    button('Last page')!.click();
    await settle(() => expect(rows()).toHaveLength(3));
    expect(button('Next page')!.disabled).toBe(true);

    const size = page().querySelector<HTMLSelectElement>('app-table-pagination select')!;
    size.value = '50';
    size.dispatchEvent(new Event('change'));
    await settle(() => expect(rows()).toHaveLength(23));
    expect(footer()).toContain('Page 1 of 1');
  });

  it('starts at the first page again when the search changes', async () => {
    tenants = many(23);
    const { settle } = await render();
    button('Next page')!.click();
    await settle(() => expect(footer()).toContain('Page 2 of 3'));

    const search = page().querySelector<HTMLInputElement>('input[type="search"]')!;
    search.value = 'tenant 2';
    search.dispatchEvent(new Event('input'));
    await settle(() => expect(footer()).toContain('1–4 of 4 tenants'));
  });

  it('shows the page before when a deletion empties the last one', async () => {
    tenants = many(11);
    const { settle } = await render();
    button('Next page')!.click();
    await settle(() => expect(names()).toEqual(['Tenant 11']));

    button('Delete tenant Tenant 11')!.click();
    await settle(() => expect(page().textContent).toContain('Delete tenant Tenant 11?'));
    button('Delete tenant')!.click();

    await settle(() => expect(rows()).toHaveLength(10));
    expect(footer()).toContain('Page 1 of 1');
  });
});
