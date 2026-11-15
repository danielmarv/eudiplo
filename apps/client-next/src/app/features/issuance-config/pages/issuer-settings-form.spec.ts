import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { client } from '@eudiplo/sdk-core';
import { provideTanStackQuery, QueryClient } from '@tanstack/angular-query-experimental';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type Caller, CallerService } from '../../../core/auth/caller.service';
import { SessionService } from '../../../core/auth/session.service';
import { NotifyService } from '../../../core/notify/notify.service';
import { IssuerSettingsForm } from './issuer-settings-form';

describe('issuer settings form page', () => {
  let stored: Record<string, unknown>;
  let requests: { method: string; path: string; body?: unknown }[];
  let notify: Record<'success' | 'info' | 'warning' | 'error', ReturnType<typeof vi.fn>>;
  const caller = signal<Caller | undefined>({
    subject: 'admin',
    tenantId: 'acme',
    roles: ['issuance:manage'],
  });
  const page = () => document.body;
  const text = () => page().textContent?.replace(/\s+/g, ' ') ?? '';
  const button = (name: string) =>
    [...page().querySelectorAll<HTMLButtonElement>('button')].find(
      (candidate) => candidate.textContent?.replace(/\s+/g, ' ').trim() === name
    );
  const json = (body: unknown, status = 200) =>
    new Response(body === undefined ? null : JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });

  async function render() {
    const fixture = TestBed.createComponent(IssuerSettingsForm);
    document.body.appendChild(fixture.nativeElement);
    fixture.detectChanges();
    const settle = async (check: () => void) =>
      vi.waitFor(async () => {
        await fixture.whenStable();
        fixture.detectChanges();
        check();
      });
    await settle(() => expect(page().querySelector('[role="status"] hlm-skeleton')).toBeNull());
    return { settle };
  }

  beforeEach(() => {
    stored = {
      display: [{ name: 'Acme', locale: 'en-US' }],
      batchSize: 1,
      authorizationServers: [{ id: 'issuer-built-in', type: 'built-in', enabled: true }],
    };
    requests = [];
    notify = { success: vi.fn(), info: vi.fn(), warning: vi.fn(), error: vi.fn() };
    client.setConfig({
      baseUrl: 'http://backend.test',
      fetch: async (request: RequestInfo | URL) => {
        const call = request instanceof Request ? request : new Request(String(request));
        const path = new URL(call.url).pathname;
        const raw = call.method === 'POST' ? await call.clone().text() : '';
        requests.push({ method: call.method, path, body: raw ? JSON.parse(raw) : undefined });
        if (path === '/api/issuer/config')
          return call.method === 'POST' ? json(JSON.parse(raw), 201) : json(stored);
        if (path === '/api/registrar/config') return json({ statusCode: 404 }, 404);
        if (path === '/api/frontend-config') return json({ publicUrl: 'https://issuer.example' });
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

  it('saves the settings with every step open', async () => {
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    const { settle } = await render();
    await settle(() =>
      expect(page().querySelector<HTMLInputElement>('#issuer-name-0')?.value).toBe('Acme')
    );
    expect(button('Save settings')).toBeDefined();
    button('Save settings')!.click();
    await settle(() => expect(navigate).toHaveBeenCalledWith(['/issuance-config']));
    expect(requests).toContainEqual(
      expect.objectContaining({
        method: 'POST',
        path: '/api/issuer/config',
        body: expect.objectContaining({
          display: [{ name: 'Acme', locale: 'en-US' }],
          authorizationServers: [
            expect.objectContaining({ id: 'issuer-built-in', type: 'built-in' }),
          ],
          federation: null,
          registrationCertificate: null,
        }),
      })
    );
  });

  it('goes step by step while the issuer has no name, and refuses a server without one enabled', async () => {
    stored = { batchSize: 1, authorizationServers: [] };
    const { settle } = await render();
    await settle(() => expect(button('Continue')).toBeDefined());
    const name = page().querySelector<HTMLInputElement>('#issuer-name-0')!;
    name.value = 'Acme';
    name.dispatchEvent(new Event('input'));
    button('Continue')!.click();
    await settle(() => expect(button('Add authorization server')).toBeDefined());
    button('Continue')!.click();
    await settle(() => expect(text()).toContain('Add at least one enabled authorization server.'));
  });
});
