import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { client } from '@eudiplo/sdk-core';
import { provideTanStackQuery, QueryClient } from '@tanstack/angular-query-experimental';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type Caller, CallerService } from '../../core/auth/caller.service';
import { SessionService } from '../../core/auth/session.service';
import { Dashboard } from './dashboard';

describe('Dashboard', () => {
  /** The paths the dashboard requested, in order. */
  let requests: string[];
  /** The full addresses, with their queries. */
  let urls: string[];
  let answers: Record<string, unknown>;
  const caller = signal<Caller | undefined>(undefined);

  const json = (body: unknown) =>
    new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });

  async function render(as: Caller) {
    caller.set(as);
    const fixture = TestBed.createComponent(Dashboard);
    fixture.detectChanges();
    await vi.waitFor(async () => {
      await fixture.whenStable();
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('hlm-skeleton')).toBeNull();
    });
    return fixture.nativeElement as HTMLElement;
  }

  beforeEach(() => {
    requests = [];
    urls = [];
    answers = {
      '/api/version': { version: '3.4.0' },
      '/api/frontend-config': { configImportMode: 'disabled', authMode: 'builtin', publicUrl: '' },
      '/api/tenant': [
        { id: 'acme', name: 'Acme University', status: 'active', clients: [{}, {}] },
        { id: 'museum', name: 'City Museum', status: null, clients: [{}] },
      ],
      '/api/session/stats': {
        retention: { ttlSeconds: 86400, cleanupMode: 'full' },
        issuance: {
          total: 5,
          byStatus: { active: 1, fetched: 0, completed: 3, expired: 0, failed: 1, cancelled: 0 },
          failureCodes: [],
          lastCompletedAt: null,
        },
      },
      '/api/session': {
        items: [
          {
            id: '7f3c2a10-aaaa',
            status: 'completed',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            reference: 'Enrolment 2026-0412',
          },
        ],
        total: 1,
        page: 1,
        pageSize: 6,
        totalPages: 1,
      },
    };
    client.setConfig({
      baseUrl: 'http://backend.test',
      fetch: async (request: RequestInfo | URL) => {
        const url = new URL(request instanceof Request ? request.url : String(request));
        requests.push(url.pathname);
        urls.push(url.href);
        return json(answers[url.pathname] ?? []);
      },
    });
    TestBed.configureTestingModule({
      imports: [Dashboard],
      providers: [
        provideRouter([]),
        provideTanStackQuery(new QueryClient({ defaultOptions: { queries: { retry: false } } })),
        { provide: CallerService, useValue: { loadedCaller: caller.asReadonly() } },
        { provide: SessionService, useValue: { getBaseUrl: () => 'http://backend.test' } },
      ],
    });
  });

  afterEach(() => {
    client.setConfig({ fetch: () => new Promise<Response>(() => undefined) });
  });

  it('shows an operator the tenants and the instance, and asks for no tenant data', async () => {
    const page = await render({
      subject: 'local-admin',
      tenantId: null,
      roles: ['tenants:manage'],
    });

    expect(page.textContent).toContain('You manage the 2 tenants of this instance.');
    expect(page.querySelector('#tenants-heading')).not.toBeNull();
    expect(page.textContent).toContain('Acme University');
    expect(page.textContent).toContain('1 active');
    expect(page.textContent).toContain('Add a tenant');
    expect(page.querySelector('#sessions-heading')).toBeNull();
    expect(requests).not.toContain('/api/session');
    expect(requests).not.toContain('/api/session/stats');
  });

  it('shows a tenant its sessions of the last day and the actions of its roles', async () => {
    const page = await render({
      subject: 'acme-console',
      tenantId: 'acme',
      roles: ['issuance:offer'],
    });

    expect(page.textContent).toContain('Here is what happened on acme in the last 24 hours.');
    expect(page.querySelector('#sessions-heading')).not.toBeNull();
    expect(page.textContent).toContain('Enrolment 2026-0412');
    const recentSessionLink = page.querySelector<HTMLAnchorElement>(
      'a[href^="/session-management?"]'
    );
    expect(recentSessionLink).not.toBeNull();
    expect(new URL(recentSessionLink!.href).searchParams.get('q')).toBe('7f3c2a10-aaaa');
    expect(page.textContent).toContain('3 completed');
    expect(page.textContent).toContain('1 failed');
    expect(page.textContent).toContain('Issue a credential');
    expect(page.textContent).not.toContain('Request a presentation');
    expect(page.querySelector('#tenants-heading')).toBeNull();
    expect(requests).not.toContain('/api/tenant');
    // Without issuance:manage the credential types are neither shown nor loaded.
    expect(requests).not.toContain('/api/issuer/credentials');
  });

  it('says a figure could not be loaded instead of showing zero', async () => {
    client.setConfig({
      fetch: async (request: RequestInfo | URL) => {
        const path = new URL(request instanceof Request ? request.url : String(request)).pathname;
        return path === '/api/tenant'
          ? new Response(JSON.stringify({ statusCode: 500, message: 'Boom' }), {
              status: 500,
              headers: { 'Content-Type': 'application/json' },
            })
          : json(answers[path] ?? []);
      },
    });
    const page = await render({
      subject: 'local-admin',
      tenantId: null,
      roles: ['tenants:manage'],
    });

    expect(page.textContent).toContain('The tenants could not be loaded.');
    expect(page.textContent).toContain('Could not be loaded.');
  });

  describe('activity', () => {
    /** The stats requests of the activity charts: one per hour or day, each with an end. */
    const bucketRequests = () =>
      urls.filter((url) => url.includes('/api/session/stats') && url.includes('createdTo'));
    const range = (page: HTMLElement, label: string) =>
      [
        ...page.querySelectorAll<HTMLButtonElement>('[aria-label="Period of the charts"] button'),
      ].find((button) => button.textContent?.trim() === label)!;
    const tenantClient = { subject: 'acme-console', tenantId: 'acme', roles: ['issuance:offer'] };

    it('shows a tenant its sessions per hour, and only the periods the backend keeps', async () => {
      const page = await render(tenantClient);

      expect(page.querySelector('#activity-heading')).not.toBeNull();
      expect(page.textContent).toContain('Issuance outcomes');
      // The tenant reads no presentation sessions, so none are charted.
      expect(page.textContent).not.toContain('Presentation outcomes');
      // A single kind has no legend, so the chart's title names it.
      expect(page.textContent).toContain('Issuance sessions over time');
      expect(bucketRequests()).toHaveLength(24);
      expect(range(page, '24 hours').getAttribute('aria-pressed')).toBe('true');
      expect(range(page, '7 days').disabled).toBe(true);
      expect(page.textContent).toContain(
        'Sessions are deleted 1 day after they start, so the charts reach back no further.'
      );
    });

    it('charts a longer period per day where the backend keeps the sessions', async () => {
      answers['/api/session/stats'] = {
        ...(answers['/api/session/stats'] as object),
        retention: { ttlSeconds: 86400, cleanupMode: 'anonymize' },
      };
      const page = await render(tenantClient);
      urls = [];

      range(page, '7 days').click();

      await vi.waitFor(() => expect(bucketRequests()).toHaveLength(7));
      await vi.waitFor(() =>
        expect(range(page, '7 days').getAttribute('aria-pressed')).toBe('true')
      );
    });
  });
});
