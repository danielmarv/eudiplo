import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { client } from '@eudiplo/sdk-core';
import { provideTanStackQuery, QueryClient } from '@tanstack/angular-query-experimental';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { type Caller } from '../../../core/auth/caller.service';
import { CallerService } from '../../../core/auth/caller.service';
import { SessionService } from '../../../core/auth/session.service';
import { NotifyService } from '../../../core/notify/notify.service';
import { SessionList } from './session-list';

describe('SessionList routed state', () => {
  const requests: URL[] = [];

  afterEach(() => {
    TestBed.inject(QueryClient).clear();
    TestBed.inject(Router).dispose();
    client.setConfig({ fetch: () => new Promise<Response>(() => undefined) });
  });

  it('restores a bookmark and requests the matching server page and sort', async () => {
    requests.length = 0;
    const caller = signal<Caller | undefined>({
      subject: 'acme-user',
      tenantId: 'acme',
      roles: ['sessions:read'],
    });
    client.setConfig({
      baseUrl: 'http://backend.test',
      fetch: async (request: RequestInfo | URL) => {
        const url = new URL(request instanceof Request ? request.url : String(request));
        requests.push(url);
        if (url.pathname === '/api/session') {
          return new Response(
            JSON.stringify({
              items: [],
              total: 120,
              page: 2,
              pageSize: 50,
              totalPages: 3,
            }),
            { headers: { 'Content-Type': 'application/json' } }
          );
        }
        return new Response('[]', { headers: { 'Content-Type': 'application/json' } });
      },
    });
    TestBed.configureTestingModule({
      imports: [SessionList],
      providers: [
        provideRouter([{ path: 'session-management', component: SessionList }]),
        provideTanStackQuery(new QueryClient({ defaultOptions: { queries: { retry: false } } })),
        { provide: SessionService, useValue: { getBaseUrl: () => 'http://backend.test' } },
        { provide: CallerService, useValue: { loadedCaller: caller } },
        {
          provide: NotifyService,
          useValue: { success: vi.fn(), info: vi.fn(), warning: vi.fn(), error: vi.fn() },
        },
      ],
    });

    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl(
      '/session-management?q=lookup&page=2&pageSize=50&sortBy=updatedAt&sortOrder=desc',
      SessionList
    );
    await vi.waitFor(() =>
      expect(requests.some((url) => url.pathname === '/api/session')).toBe(true)
    );

    const query = requests.find((url) => url.pathname === '/api/session')!.searchParams;
    expect(query.get('q')).toBe('lookup');
    expect(query.get('page')).toBe('2');
    expect(query.get('pageSize')).toBe('50');
    expect(query.get('sortBy')).toBe('updatedAt');
    expect(query.get('sortOrder')).toBe('desc');
  });
});
