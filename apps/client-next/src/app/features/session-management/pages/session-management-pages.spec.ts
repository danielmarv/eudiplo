import { signal, type Type } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { client } from '@eudiplo/sdk-core';
import { provideTanStackQuery, QueryClient } from '@tanstack/angular-query-experimental';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type Caller } from '../../../core/auth/caller.service';
import { CallerService } from '../../../core/auth/caller.service';
import { SessionService } from '../../../core/auth/session.service';
import { NotifyService } from '../../../core/notify/notify.service';
import { SessionList } from './session-list';
import { SessionSettings } from './session-settings';

describe('session management pages', () => {
  let sessions: Record<string, unknown>[];
  let config: Record<string, unknown>;
  let requests: { method: string; url: URL; body?: unknown }[];
  let failSessionLoad: boolean;
  let failSettingsLoad: boolean;
  let failReset: boolean;
  let failSave: boolean;
  let holdSave: boolean;
  let completeSave: (() => void) | undefined;
  let fileManagedTenant: boolean;
  let failDeleteIds: Set<string>;
  let cancelResponses: Record<string, number>;
  let notify: {
    success: ReturnType<typeof vi.fn>;
    info: ReturnType<typeof vi.fn>;
    warning: ReturnType<typeof vi.fn>;
    error: ReturnType<typeof vi.fn>;
  };
  const caller = signal<Caller | undefined>(undefined);

  const json = (body: unknown, status = 200) =>
    new Response(status === 204 ? null : JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });
  const session = (id: string, extra: Record<string, unknown> = {}) => ({
    id,
    status: 'active',
    requestId: undefined,
    reference: `ref-${id}`,
    createdAt: '2026-10-01T08:00:00Z',
    updatedAt: '2026-10-01T08:05:00Z',
    consumed: false,
    ...extra,
  });
  const page = () => document.body;
  const text = () => page().textContent?.replace(/\s+/g, ' ') ?? '';
  const rows = () => [...page().querySelectorAll('tbody tr')];
  const button = (label: string) =>
    [...page().querySelectorAll<HTMLButtonElement>('button')].find(
      (candidate) => candidate.textContent?.trim() === label
    );

  async function render<T>(component: Type<T>) {
    const fixture = TestBed.createComponent(component);
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
    sessions = [
      session('issuance-1'),
      session('presentation-1', { requestId: 'travel', status: 'fetched' }),
    ];
    config = { ttlSeconds: 3600, cleanupMode: 'full' };
    requests = [];
    failSessionLoad = false;
    failSettingsLoad = false;
    failReset = false;
    failSave = false;
    holdSave = false;
    completeSave = undefined;
    fileManagedTenant = false;
    failDeleteIds = new Set();
    cancelResponses = {};
    notify = {
      success: vi.fn(),
      info: vi.fn(),
      warning: vi.fn(),
      error: vi.fn(),
    };
    caller.set({
      subject: 'acme-user',
      tenantId: 'acme',
      roles: ['issuance:offer', 'presentation:request', 'issuance:manage'],
    });
    client.setConfig({
      baseUrl: 'http://backend.test',
      fetch: async (request: RequestInfo | URL) => {
        const req = request instanceof Request ? request : new Request(String(request));
        const url = new URL(req.url);
        const body = ['POST', 'PUT', 'PATCH'].includes(req.method)
          ? await req.clone().json()
          : undefined;
        requests.push({ method: req.method, url, body });

        if (url.pathname === '/api/session') {
          if (failSessionLoad) return json({ message: 'Service Unavailable' }, 503);
          const statuses = url.searchParams.getAll('status');
          const filtered = statuses.length
            ? sessions.filter((item) => statuses.includes(String(item['status'])))
            : sessions;
          const pageNumber = Number(url.searchParams.get('page') ?? 1);
          const pageSize = Number(url.searchParams.get('pageSize') ?? 25);
          return json({
            items: filtered.slice((pageNumber - 1) * pageSize, pageNumber * pageSize),
            total: filtered.length,
            page: pageNumber,
            pageSize,
            totalPages: Math.ceil(filtered.length / pageSize),
          });
        }
        if (url.pathname.startsWith('/api/session/')) {
          if (req.method === 'DELETE') {
            const id = url.pathname.split('/').at(-1) ?? '';
            if (failDeleteIds.has(id)) return json({ message: 'Delete failed' }, 503);
            sessions = sessions.filter((item) => `/api/session/${item['id']}` !== url.pathname);
            return json(undefined, 204);
          }
          if (url.pathname.endsWith('/cancel')) {
            const id = url.pathname.split('/').at(-2) ?? '';
            const status = cancelResponses[id];
            if (status) return json({ statusCode: status, message: 'Cancellation failed' }, status);
            sessions = sessions.map((item) =>
              item['id'] === id ? { ...item, status: 'cancelled' } : item
            );
          }
          return json(undefined, 204);
        }
        if (url.pathname === '/api/session-config') {
          if (req.method === 'GET' && failSettingsLoad) {
            return json({ message: 'Service Unavailable' }, 503);
          }
          if (req.method === 'DELETE' && failReset) {
            return json({ message: 'Reset failed' }, 503);
          }
          if (req.method === 'PUT' && failSave) {
            return json({ message: 'Save failed' }, 503);
          }
          if (req.method === 'PUT' && holdSave) {
            return new Promise<Response>((resolve) => {
              completeSave = () => {
                config = body as Record<string, unknown>;
                resolve(json(config));
              };
            });
          }
          if (req.method === 'PUT') config = body as Record<string, unknown>;
          if (req.method === 'DELETE') config = {};
          return req.method === 'DELETE' ? json(undefined, 204) : json(config);
        }
        if (url.pathname === '/api/config-bundles/resources/Tenant') {
          return json(
            fileManagedTenant
              ? [
                  {
                    kind: 'Tenant',
                    resourceId: 'tenant',
                    ownership: 'file-managed',
                    source: 'folder:acme/info.json',
                  },
                ]
              : []
          );
        }
        if (url.pathname === '/api/issuer/credentials') return json([]);
        if (url.pathname === '/api/verifier/config') return json([]);
        return json({ statusCode: 404, message: `Unhandled ${req.method} ${url.pathname}` }, 404);
      },
    });
    TestBed.configureTestingModule({
      imports: [SessionList, SessionSettings],
      providers: [
        provideRouter([]),
        provideTanStackQuery(new QueryClient({ defaultOptions: { queries: { retry: false } } })),
        { provide: SessionService, useValue: { getBaseUrl: () => 'http://backend.test' } },
        { provide: CallerService, useValue: { loadedCaller: caller } },
        { provide: NotifyService, useValue: notify },
      ],
    });
  });

  afterEach(() => {
    TestBed.inject(QueryClient).clear();
    client.setConfig({ fetch: () => new Promise<Response>(() => undefined) });
    document.body.innerHTML = '';
  });

  it('lists server sessions and applies the pending shortcut to the URL-backed query', async () => {
    const { settle } = await render(SessionList);
    await settle(() => expect(rows()).toHaveLength(2));
    expect(text()).toContain('issuance-1');
    expect(text()).toContain('Presentation');

    button('Pending')!.click();
    await settle(() => {
      const request = requests.filter((item) => item.url.pathname === '/api/session').at(-1);
      expect(request?.url.searchParams.getAll('status')).toEqual(['active', 'fetched']);
    });
  });

  it('uses the status dropdown to select multiple session statuses', async () => {
    const { settle } = await render(SessionList);
    await settle(() => expect(rows()).toHaveLength(2));

    const details = page().querySelector<HTMLDetailsElement>('details')!;
    details.querySelector('summary')!.click();
    expect(details.open).toBe(true);

    for (const status of ['active', 'fetched']) {
      const checkbox = details.querySelector<HTMLInputElement>(`input[value="${status}"]`)!;
      checkbox.checked = true;
      checkbox.dispatchEvent(new Event('change', { bubbles: true }));
    }

    await settle(() => {
      const request = requests.filter((item) => item.url.pathname === '/api/session').at(-1);
      expect(request?.url.searchParams.getAll('status')).toEqual(['active', 'fetched']);
    });
    expect(details.querySelector('summary')?.textContent).toContain('Active, Fetched');
    document.body.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(details.open).toBe(false);
  });

  it('shows the server total and requests the next page', async () => {
    sessions = Array.from({ length: 30 }, (_, index) => session(`session-${index + 1}`));
    const { settle } = await render(SessionList);
    await settle(() => expect(rows()).toHaveLength(25));
    expect(page().querySelector('app-table-pagination')?.textContent).toContain('1–25 of 30');

    page().querySelector<HTMLButtonElement>('button[aria-label="Next page"]')!.click();
    await settle(() => expect(rows()).toHaveLength(5));
    expect(
      requests
        .filter((item) => item.url.pathname === '/api/session')
        .at(-1)
        ?.url.searchParams.get('page')
    ).toBe('2');
    expect(page().querySelector('app-table-pagination')?.textContent).toContain('26–30 of 30');

    const pageSize = page().querySelector<HTMLSelectElement>('app-table-pagination select')!;
    pageSize.value = '100';
    pageSize.dispatchEvent(new Event('change', { bubbles: true }));
    await settle(() => expect(rows()).toHaveLength(30));
    const lastRequest = requests.filter((item) => item.url.pathname === '/api/session').at(-1);
    expect(lastRequest?.url.searchParams.get('page')).toBe('1');
    expect(lastRequest?.url.searchParams.get('pageSize')).toBe('100');
    expect(page().querySelector('app-table-pagination')?.textContent).toContain('1–30 of 30');
  });

  it('distinguishes an empty session list from a loading or failed request', async () => {
    sessions = [];
    const { settle } = await render(SessionList);
    await settle(() => expect(text()).toContain('No sessions found'));
    expect(rows()).toHaveLength(0);
    expect(text()).not.toContain('Sessions could not be loaded');
  });

  it('explains read-only rows and hides actions the caller cannot use', async () => {
    caller.set({ subject: 'reader', tenantId: 'acme', roles: ['sessions:read'] });
    const { settle } = await render(SessionList);
    await settle(() => expect(rows()).toHaveLength(2));

    expect(text()).toContain('Some sessions are read-only with your roles');
    expect(page().querySelector('a[href="/offer/issuance"]')).toBeNull();
    expect(rows()[0].querySelector<HTMLInputElement>('input[type="checkbox"]')?.disabled).toBe(
      true
    );
  });

  it('shows a load error instead of an empty list and retries', async () => {
    failSessionLoad = true;
    const { settle } = await render(SessionList);
    await settle(() => expect(text()).toContain('Sessions could not be loaded'));
    expect(text()).toContain('Service Unavailable');
    expect(rows()).toHaveLength(0);

    failSessionLoad = false;
    button('Retry')!.click();
    await settle(() => expect(rows()).toHaveLength(2));
  });

  it('distinguishes cancellation conflicts from other failures', async () => {
    sessions = [session('cancel-ok'), session('cancel-conflict'), session('cancel-error')];
    cancelResponses = { 'cancel-conflict': 409, 'cancel-error': 500 };
    const { settle } = await render(SessionList);
    await settle(() => expect(rows()).toHaveLength(3));

    for (const row of rows()) {
      const checkbox = row.querySelector<HTMLInputElement>('input[type="checkbox"]')!;
      checkbox.checked = true;
      checkbox.dispatchEvent(new Event('change', { bubbles: true }));
    }
    await settle(() => expect(text()).toContain('3 selected on this page'));
    button('Cancel selected')!.click();
    await settle(() => expect(button('Cancel sessions')).toBeDefined());
    const cancelForm = [...page().querySelectorAll('form')].find((form) =>
      form.querySelector('#cancel-reason')
    )!;
    const reason = cancelForm.querySelector<HTMLTextAreaElement>('#cancel-reason')!;
    reason.value = '  duplicate request  ';
    reason.dispatchEvent(new Event('input', { bubbles: true }));
    cancelForm.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

    await settle(() => expect(notify.error).toHaveBeenCalled());
    expect(notify.error.mock.calls[0][0]).toContain('Cancelled 1 of 3 sessions');
    expect(notify.error.mock.calls[0][0]).toContain('1 no longer pending');
    expect(requests.find((item) => item.url.pathname.endsWith('/cancel'))?.body).toEqual({
      reason: 'duplicate request',
    });
  });

  it('shows settings load errors and retries without showing an editable form', async () => {
    failSettingsLoad = true;
    const { settle } = await render(SessionSettings);
    await settle(() => expect(text()).toContain('Could not load session settings'));
    expect(page().querySelector('form')).toBeNull();

    failSettingsLoad = false;
    button('Retry')!.click();
    await settle(() => expect(text()).toContain('Current stored settings'));
  });

  it('bulk-deletes only selected rows after confirmation', async () => {
    const { settle } = await render(SessionList);
    await settle(() => expect(rows()).toHaveLength(2));

    const rowCheckbox = rows()[0].querySelector<HTMLInputElement>('input[type="checkbox"]')!;
    rowCheckbox.checked = true;
    rowCheckbox.dispatchEvent(new Event('change', { bubbles: true }));
    await settle(() => expect(text()).toContain('selected on this page'));
    button('Delete selected')!.click();
    await settle(() => expect(button('Delete sessions')).toBeDefined());
    button('Delete sessions')!.click();

    await settle(() =>
      expect(
        requests.some(
          (item) => item.method === 'DELETE' && item.url.pathname.endsWith('issuance-1')
        )
      ).toBe(true)
    );
    expect(notify.success).toHaveBeenCalledWith('Deleted 1 session.');
  });

  it('reports partial failure when one selected session cannot be deleted', async () => {
    failDeleteIds.add('presentation-1');
    const { settle } = await render(SessionList);
    await settle(() => expect(rows()).toHaveLength(2));

    for (const row of rows()) {
      const checkbox = row.querySelector<HTMLInputElement>('input[type="checkbox"]')!;
      checkbox.checked = true;
      checkbox.dispatchEvent(new Event('change', { bubbles: true }));
    }
    await settle(() => expect(text()).toContain('2 selected on this page'));
    button('Delete selected')!.click();
    await settle(() => expect(button('Delete sessions')).toBeDefined());
    button('Delete sessions')!.click();

    await settle(() =>
      expect(notify.error).toHaveBeenCalledWith(expect.stringContaining('Deleted 1 of 2 sessions'))
    );
    expect(notify.success).not.toHaveBeenCalled();
  });

  it('rejects an inverted created-date range without querying it', async () => {
    const { settle } = await render(SessionList);
    await settle(() => expect(rows()).toHaveLength(2));
    const sessionRequests = () => requests.filter((item) => item.url.pathname === '/api/session');
    const initialRequestCount = sessionRequests().length;

    const from = page().querySelector<HTMLInputElement>('#created-from')!;
    const to = page().querySelector<HTMLInputElement>('#created-to')!;
    from.value = '2026-10-10';
    from.dispatchEvent(new Event('input', { bubbles: true }));
    to.value = '2026-10-01';
    to.dispatchEvent(new Event('input', { bubbles: true }));

    await settle(() => expect(text()).toContain('Created start must be on or before its end.'));
    expect(sessionRequests()).toHaveLength(initialRequestCount);

    from.value = '2026-10-01';
    from.dispatchEvent(new Event('input', { bubbles: true }));
    to.value = '2026-10-10';
    to.dispatchEvent(new Event('input', { bubbles: true }));
    await settle(() => expect(text()).not.toContain('Created start must be on or before its end.'));

    const updated = page().querySelector<HTMLSelectElement>('#updated-filter')!;
    updated.value = 'custom';
    updated.dispatchEvent(new Event('change', { bubbles: true }));
    await settle(() => expect(page().querySelector('#updated-from')).not.toBeNull());
    const countAfterSelectingCustom = sessionRequests().length;
    const updatedFrom = page().querySelector<HTMLInputElement>('#updated-from')!;
    const updatedTo = page().querySelector<HTMLInputElement>('#updated-to')!;
    updatedFrom.value = '2026-10-10';
    updatedFrom.dispatchEvent(new Event('input', { bubbles: true }));
    updatedTo.value = '2026-10-01';
    updatedTo.dispatchEvent(new Event('input', { bubbles: true }));

    await settle(() => expect(text()).toContain('Updated start must be on or before its end.'));
    expect(sessionRequests()).toHaveLength(countAfterSelectingCustom);
  });

  it('saves an explicitly cleared TTL without clearing the stored cleanup mode', async () => {
    const { settle } = await render(SessionSettings);
    await settle(() => expect(page().textContent).toContain('Current stored settings'));

    const ttl = page().querySelector<HTMLInputElement>('#session-ttl')!;
    ttl.value = '';
    ttl.dispatchEvent(new Event('input', { bubbles: true }));
    button('Save settings')!.click();

    await settle(() =>
      expect(
        requests.some(
          (item) => item.method === 'PUT' && item.url.pathname === '/api/session-config'
        )
      ).toBe(true)
    );
    const update = requests.find(
      (item) => item.method === 'PUT' && item.url.pathname === '/api/session-config'
    )?.body as Record<string, unknown>;
    expect(update).toEqual({ ttlSeconds: null, cleanupMode: 'full' });
  });

  it('keeps form controls disabled while saving to prevent losing later edits', async () => {
    holdSave = true;
    const { settle } = await render(SessionSettings);
    await settle(() => expect(text()).toContain('Current stored settings'));

    const ttl = page().querySelector<HTMLInputElement>('#session-ttl')!;
    ttl.value = '7200';
    ttl.dispatchEvent(new Event('input', { bubbles: true }));
    button('Save settings')!.click();
    await vi.waitFor(() => expect(completeSave).toBeDefined());

    expect(ttl.disabled).toBe(true);
    expect(page().querySelector<HTMLSelectElement>('#cleanup-mode')?.disabled).toBe(true);
    expect(button('Saving…')?.disabled).toBe(true);

    completeSave!();
    await settle(() => expect(notify.success).toHaveBeenCalledWith('Session settings saved.'));
    expect(config).toEqual({ ttlSeconds: 7200, cleanupMode: 'full' });
  });

  it('keeps stored settings and reports a save failure', async () => {
    failSave = true;
    const { settle } = await render(SessionSettings);
    await settle(() => expect(text()).toContain('Current stored settings'));
    const ttl = page().querySelector<HTMLInputElement>('#session-ttl')!;
    ttl.value = '7200';
    ttl.dispatchEvent(new Event('input', { bubbles: true }));
    button('Save settings')!.click();

    await settle(() =>
      expect(notify.error).toHaveBeenCalledWith(expect.stringContaining('Save failed'))
    );
    expect(config).toEqual({ ttlSeconds: 3600, cleanupMode: 'full' });
    expect(notify.success).not.toHaveBeenCalled();
  });

  it.each([
    { value: '59', message: 'TTL must be at least 60 seconds.' },
    { value: '60.5', message: 'Enter a whole number of seconds.' },
  ])('does not save invalid TTL $value', async ({ value, message }) => {
    const { settle } = await render(SessionSettings);
    await settle(() => expect(text()).toContain('Current stored settings'));
    const ttl = page().querySelector<HTMLInputElement>('#session-ttl')!;
    ttl.value = value;
    ttl.dispatchEvent(new Event('input', { bubbles: true }));
    button('Save settings')!.click();

    await settle(() => expect(text()).toContain(message));
    expect(notify.error).toHaveBeenCalledWith('Check the highlighted fields.');
    expect(document.activeElement).toBe(ttl);
    expect(requests.some((item) => item.method === 'PUT')).toBe(false);
  });

  it('keeps file-managed tenant settings read-only', async () => {
    fileManagedTenant = true;
    const { settle } = await render(SessionSettings);
    await settle(() => expect(button('Save settings')?.disabled).toBe(true));

    expect(page().querySelector<HTMLInputElement>('#session-ttl')?.disabled).toBe(true);
    expect(page().querySelector<HTMLSelectElement>('#cleanup-mode')?.disabled).toBe(true);
    expect(button('Save settings')?.disabled).toBe(true);
    expect(button('Reset to defaults')?.disabled).toBe(true);
    button('Save settings')?.click();
    button('Reset to defaults')?.click();
    expect(requests.some((item) => ['PUT', 'DELETE'].includes(item.method))).toBe(false);
  });

  it('keeps stored settings after a reset failure and clears them after confirmation', async () => {
    const { settle } = await render(SessionSettings);
    await settle(() => expect(text()).toContain('Current stored settings'));

    failReset = true;
    button('Reset to defaults')!.click();
    await settle(() => expect(button('Reset settings')).toBeDefined());
    button('Reset settings')!.click();
    await settle(() => expect(notify.error.mock.calls[0][0]).toContain('Reset failed'));
    expect(config).toEqual({ ttlSeconds: 3600, cleanupMode: 'full' });

    failReset = false;
    button('Reset to defaults')!.click();
    await settle(() => expect(button('Reset settings')).toBeDefined());
    button('Reset settings')!.click();
    await settle(() =>
      expect(notify.success).toHaveBeenCalledWith(
        'Session settings reset. The instance defaults apply.'
      )
    );
    expect(config).toEqual({});
  });
});
