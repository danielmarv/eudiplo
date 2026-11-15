import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { client } from '@eudiplo/sdk-core';
import { provideTanStackQuery, QueryClient } from '@tanstack/angular-query-experimental';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type Caller, CallerService } from '../../../core/auth/caller.service';
import { SessionService } from '../../../core/auth/session.service';
import { NotifyService } from '../../../core/notify/notify.service';
import { actionLabel, actionTone, changesOf, objectTypes } from '../data/activity-log-display';
import type { ActivityEntry } from '../data/activity-log-queries';
import { ActivityLog } from './activity-log';

const entry = (extra: Partial<ActivityEntry>): ActivityEntry => ({
  id: 'e1',
  tenantId: 'acme',
  actionType: 'credential_config_updated',
  actorType: 'client',
  actorId: 'acme-admin',
  changedFields: ['lifeTime'],
  before: { lifeTime: 3600 },
  after: { lifeTime: 7200 },
  timestamp: '2026-11-14T10:00:00Z',
  ...extra,
});

describe('activity log display', () => {
  it('names actions and their kind of object', () => {
    expect(actionLabel('credential_config_updated')).toBe('Credential type updated');
    expect(actionLabel('config_client_secret_generated')).toBe('Client secret generated');
    expect(actionLabel('session_cancelled')).toBe('Session cancelled');
    expect(actionTone('webhook_endpoint_deleted')).toBe('remove');
    expect(actionTone('tenant_created')).toBe('create');
    expect(
      objectTypes([
        entry({ actionType: 'tenant_updated' }),
        entry({ actionType: 'credential_config_deleted' }),
      ])
    ).toEqual([
      { value: 'credential_config', label: 'Credential type' },
      { value: 'tenant', label: 'Tenant' },
    ]);
  });

  it('lists each changed field with its values before and after', () => {
    expect(changesOf(entry({}))).toEqual([{ field: 'lifeTime', before: '3600', after: '7200' }]);
    expect(
      changesOf(entry({ changedFields: [], before: undefined, after: { name: 'Acme' } }))
    ).toEqual([{ field: 'name', before: '—', after: 'Acme' }]);
  });
});

describe('activity log page', () => {
  let entries: ActivityEntry[] | 'fail';
  const caller = signal<Caller | undefined>({
    subject: 'acme-admin',
    tenantId: 'acme',
    roles: ['clients:manage'],
  });
  const page = () => document.body;
  const text = () => page().textContent?.replace(/\s+/g, ' ') ?? '';
  const rows = () => [...page().querySelectorAll('table[hlmTable] > tbody > tr')];

  async function render() {
    const fixture = TestBed.createComponent(ActivityLog);
    document.body.appendChild(fixture.nativeElement);
    fixture.detectChanges();
    const settle = async (check: () => void) =>
      vi.waitFor(async () => {
        await fixture.whenStable();
        fixture.detectChanges();
        check();
      });
    return { settle };
  }

  beforeEach(() => {
    entries = [
      entry({}),
      entry({
        id: 'e2',
        actionType: 'webhook_endpoint_deleted',
        actorType: 'user',
        actorDisplay: 'Ada',
        changedFields: [],
        before: undefined,
        after: undefined,
        timestamp: '2026-11-13T10:00:00Z',
      }),
    ];
    client.setConfig({
      baseUrl: 'http://backend.test',
      fetch: async (request: RequestInfo | URL) => {
        const call = request instanceof Request ? request : new Request(String(request));
        const url = new URL(call.url);
        if (url.pathname === '/api/admin/audit-logs') {
          expect(url.searchParams.get('limit')).toBe('500');
          return entries === 'fail'
            ? new Response(JSON.stringify({ message: 'Unavailable' }), { status: 503 })
            : new Response(JSON.stringify(entries), {
                headers: { 'Content-Type': 'application/json' },
              });
        }
        return new Response('[]', { headers: { 'Content-Type': 'application/json' } });
      },
    });
    TestBed.configureTestingModule({
      providers: [
        provideTanStackQuery(new QueryClient({ defaultOptions: { queries: { retry: false } } })),
        { provide: SessionService, useValue: { getBaseUrl: () => 'http://backend.test' } },
        { provide: CallerService, useValue: { loadedCaller: caller.asReadonly() } },
        { provide: NotifyService, useValue: { success: vi.fn(), error: vi.fn() } },
      ],
    });
  });

  afterEach(() => {
    client.setConfig({ fetch: () => new Promise<Response>(() => undefined) });
    document.body.innerHTML = '';
  });

  it('lists the newest entry first and opens one to show its changes', async () => {
    const { settle } = await render();
    await settle(() => expect(rows()).toHaveLength(2));
    expect(rows()[0].textContent).toContain('Credential type updated');
    expect(rows()[1].textContent).toContain('Ada');

    page()
      .querySelector<HTMLButtonElement>('[aria-label="Show details of Credential type updated"]')!
      .click();
    await settle(() => expect(rows()).toHaveLength(3));
    const change = [...rows()[1].querySelectorAll('tbody tr > *')].map((cell) =>
      cell.textContent?.trim()
    );
    expect(change).toEqual(['lifeTime', '3600', '7200']);
  });

  it('filters by the kind of object', async () => {
    const { settle } = await render();
    await settle(() => expect(rows()).toHaveLength(2));
    const select = page().querySelector<HTMLSelectElement>('#activity-object')!;
    select.value = 'webhook_endpoint';
    select.dispatchEvent(new Event('change'));
    await settle(() => expect(rows()).toHaveLength(1));
    expect(rows()[0].textContent).toContain('Webhook endpoint deleted');
  });

  it('says when the log cannot be loaded', async () => {
    entries = 'fail';
    const { settle } = await render();
    await settle(() => expect(text()).toContain('The activity log could not be loaded'));
  });
});
