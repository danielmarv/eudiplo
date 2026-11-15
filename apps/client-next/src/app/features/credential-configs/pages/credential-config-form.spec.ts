import { signal, type Type } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { client } from '@eudiplo/sdk-core';
import { provideTanStackQuery, QueryClient } from '@tanstack/angular-query-experimental';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type Caller, CallerService } from '../../../core/auth/caller.service';
import { SessionService } from '../../../core/auth/session.service';
import { NotifyService } from '../../../core/notify/notify.service';
import { CredentialConfigForm } from './credential-config-form';

describe('credential type form page', () => {
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
  const type = (id: string, value: string) => {
    const input = page().querySelector<HTMLInputElement>(`#${id}`)!;
    input.value = value;
    input.dispatchEvent(new Event('input'));
  };
  const json = (body: unknown, status = 200) =>
    new Response(body === undefined ? null : JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });

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
    await settle(() => expect(page().querySelector('[role="status"] hlm-skeleton')).toBeNull());
    return { settle };
  }

  beforeEach(() => {
    requests = [];
    notify = { success: vi.fn(), info: vi.fn(), warning: vi.fn(), error: vi.fn() };
    client.setConfig({
      baseUrl: 'http://backend.test',
      fetch: async (request: RequestInfo | URL) => {
        const call = request instanceof Request ? request : new Request(String(request));
        const path = new URL(call.url).pathname;
        const raw = ['POST', 'PATCH'].includes(call.method) ? await call.clone().text() : '';
        const body = raw ? JSON.parse(raw) : undefined;
        requests.push({ method: call.method, path, body });
        if (path === '/api/issuer/credentials' && call.method === 'POST') return json(body, 201);
        if (path === '/api/issuer/credentials/pid') {
          if (call.method === 'PATCH') return json(body);
          return json({
            id: 'pid',
            vct: 'urn:eudi:pid:1',
            lifeTime: 3600,
            config: { format: 'dc+sd-jwt', display: [{ name: 'PID', locale: 'en-US' }] },
            fields: [{ path: ['given_name'], type: 'string', mandatory: true, disclosable: true }],
          });
        }
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

  it('adds a credential type step by step', async () => {
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    const { settle } = await render(CredentialConfigForm);

    button('Continue')!.click();
    await settle(() => expect(text()).toContain('Check the highlighted fields in Basics.'));

    type('cc-id', 'membership');
    type('cc-vct', 'https://club.example/membership');
    button('Continue')!.click();
    await settle(() => expect(button('Add claim')).toBeDefined());
    button('Add claim')!.click();
    await settle(() => expect(page().querySelector('#claim-path-0')).not.toBeNull());
    type('claim-path-0', 'name');
    button('Continue')!.click();
    await settle(() => expect(page().querySelector('#display-name-0')).not.toBeNull());
    type('display-name-0', 'Membership');
    button('Continue')!.click();
    await settle(() => expect(text()).toContain('Holder binding and revocation'));
    button('Continue')!.click();
    await settle(() => expect(text()).toContain('Check what wallets will receive'));
    button('Add credential type')!.click();

    await settle(() => expect(navigate).toHaveBeenCalledWith(['/credential-config', 'membership']));
    expect(requests).toContainEqual(
      expect.objectContaining({
        method: 'POST',
        path: '/api/issuer/credentials',
        body: expect.objectContaining({
          id: 'membership',
          vct: 'https://club.example/membership',
          fields: [{ path: ['name'], type: 'string', mandatory: false, disclosable: true }],
          config: expect.objectContaining({
            format: 'dc+sd-jwt',
            display: [{ name: 'Membership', locale: 'en-US' }],
          }),
        }),
      })
    );
  });

  it('edits a stored credential type with every step open', async () => {
    vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    const { settle } = await render(CredentialConfigForm, { id: 'pid' });
    await settle(() => expect(page().querySelector<HTMLInputElement>('#cc-id')?.value).toBe('pid'));
    expect(page().querySelector<HTMLInputElement>('#cc-id')!.disabled).toBe(true);
    type('cc-description', 'Person identification data');
    button('Save credential type')!.click();
    await settle(() => expect(notify.success).toHaveBeenCalledWith('pid saved.'));
    expect(requests).toContainEqual(
      expect.objectContaining({
        method: 'PATCH',
        path: '/api/issuer/credentials/pid',
        body: expect.objectContaining({ description: 'Person identification data' }),
      })
    );
  });
});
