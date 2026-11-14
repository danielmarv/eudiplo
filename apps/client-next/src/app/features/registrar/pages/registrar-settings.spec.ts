import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { client } from '@eudiplo/sdk-core';
import { provideTanStackQuery, QueryClient } from '@tanstack/angular-query-experimental';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type Caller, CallerService } from '../../../core/auth/caller.service';
import { SessionService } from '../../../core/auth/session.service';
import { NotifyService } from '../../../core/notify/notify.service';
import { expectUnavailable } from '../../../shared/testing/unavailable-action';
import { RegistrarSettings } from './registrar-settings';

describe('RegistrarSettings', () => {
  let stored: Record<string, unknown> | null;
  let ownership: unknown[];
  let requests: { method: string; path: string; body?: unknown }[];
  let notify: Record<'success' | 'info' | 'warning' | 'error', ReturnType<typeof vi.fn>>;
  const caller = signal<Caller | undefined>(undefined);

  const json = (body: unknown, status = 200) =>
    new Response(body === undefined ? null : JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });

  const page = () => document.body;
  const text = (element: Element | null = page()) =>
    element?.textContent?.replace(/\s+/g, ' ') ?? '';
  const button = (name: string) =>
    [...page().querySelectorAll<HTMLButtonElement>('button')].find(
      (candidate) => candidate.textContent?.trim() === name
    );
  const field = (id: string) => page().querySelector<HTMLInputElement>(`#${id}`)!;
  const type = (id: string, value: string) => {
    field(id).value = value;
    field(id).dispatchEvent(new Event('input'));
  };

  async function render() {
    const fixture = TestBed.createComponent(RegistrarSettings);
    document.body.appendChild(fixture.nativeElement);
    fixture.detectChanges();
    const settle = async (check: () => void) =>
      vi.waitFor(async () => {
        await fixture.whenStable();
        fixture.detectChanges();
        check();
      });
    await settle(() => expect(page().querySelector('hlm-skeleton')).toBeNull());
    return settle;
  }

  beforeEach(() => {
    stored = {
      registrarUrl: 'https://registrar.example/api',
      oidcUrl: 'https://auth.example/realms/registrar',
      clientId: 'eudiplo',
      username: 'acme',
      hasPassword: true,
      hasClientSecret: false,
      relyingPartyContact: { email: 'support@acme.example' },
      registrationCertificateDefaults: { privacy_policy: 'https://acme.example/privacy' },
    };
    ownership = [];
    requests = [];
    notify = { success: vi.fn(), info: vi.fn(), warning: vi.fn(), error: vi.fn() };
    caller.set({ subject: 'acme-admin', tenantId: 'acme', roles: ['registrar:manage'] });
    client.setConfig({
      baseUrl: 'http://backend.test',
      fetch: async (request: RequestInfo | URL) => {
        const call = request instanceof Request ? request : new Request(String(request));
        const path = new URL(call.url).pathname;
        const raw = ['POST', 'PATCH'].includes(call.method) ? await call.clone().text() : '';
        const body = raw ? JSON.parse(raw) : undefined;
        requests.push({ method: call.method, path, body });
        if (path === '/api/registrar/config') {
          if (call.method === 'GET') {
            return stored ? json(stored) : json({ statusCode: 404, message: 'Not found' }, 404);
          }
          if (call.method === 'DELETE') {
            stored = null;
            return json(undefined);
          }
          stored = {
            ...stored,
            ...(body as object),
            hasPassword: true,
            hasClientSecret: !!(body as { clientSecret?: string }).clientSecret,
          };
          delete stored['password'];
          return json(stored, call.method === 'POST' ? 201 : 200);
        }
        if (path.startsWith('/api/config-bundles/resources/')) return json(ownership);
        return json([]);
      },
    });
    TestBed.configureTestingModule({
      imports: [RegistrarSettings],
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

  it('configures a registrar, filled in from a preset, with the password', async () => {
    stored = null;
    const settle = await render();
    expect(text(page().querySelector('[data-testid="registrar-state"]'))).toContain(
      'Not configured'
    );

    const preset = page().querySelector<HTMLSelectElement>('#registrar-preset')!;
    preset.value = 'German sandbox';
    preset.dispatchEvent(new Event('change'));
    await settle(() =>
      expect(field('registrar-url').value).toBe('https://sandbox.eudi-wallet.org/api')
    );
    type('registrar-username', 'acme');
    button('Save configuration')!.click();
    await settle(() => expect(text()).toContain('Enter the password.'));

    type('registrar-password', 's3cret');
    button('Save configuration')!.click();
    await settle(() =>
      expect(notify.success).toHaveBeenCalledWith('Registrar configuration saved.')
    );
    expect(requests.find((call) => call.method === 'POST')?.body).toMatchObject({
      registrarUrl: 'https://sandbox.eudi-wallet.org/api',
      clientId: 'swagger',
      username: 'acme',
      password: 's3cret',
    });
    await settle(() =>
      expect(text(page().querySelector('[data-testid="registrar-state"]'))).toContain(
        'Connected as acme'
      )
    );
    expect(field('registrar-password').value).toBe('');
  });

  it('changes the contact of a stored configuration and keeps its password', async () => {
    const settle = await render();
    await settle(() => expect(field('contact-email').value).toBe('support@acme.example'));
    expect(text()).toContain('A password is stored. Leave this empty to keep it.');

    type('contact-phone', '+49 30 1234567');
    button('Save configuration')!.click();
    await settle(() => expect(requests.some((call) => call.method === 'PATCH')).toBe(true));
    expect(requests.find((call) => call.method === 'PATCH')?.body).toEqual({
      registrationCertificateDefaults: { privacy_policy: 'https://acme.example/privacy' },
      relyingPartyContact: { email: 'support@acme.example', phone: '+49 30 1234567' },
    });
  });

  it('asks for the password again when the URLs change', async () => {
    const settle = await render();
    await settle(() =>
      expect(field('oidc-url').value).toBe('https://auth.example/realms/registrar')
    );

    type('oidc-url', 'https://auth.other.example/realms/registrar');
    button('Save configuration')!.click();
    await settle(() => expect(text()).toContain('The URLs changed: enter the password again.'));
    expect(requests.some((call) => call.method === 'POST' || call.method === 'PATCH')).toBe(false);
  });

  it('deletes the configuration after saying what stops working', async () => {
    const settle = await render();
    await settle(() => expect(button('Delete configuration')).toBeDefined());

    button('Delete configuration')!.click();
    await settle(() => expect(text()).toContain('presentation requests carry no registration'));
    [...page().querySelectorAll<HTMLButtonElement>('button')]
      .filter((candidate) => candidate.textContent?.trim() === 'Delete configuration')
      .at(-1)!
      .click();
    await settle(() =>
      expect(notify.success).toHaveBeenCalledWith('Registrar configuration deleted.')
    );
    expect(requests).toContainEqual({
      method: 'DELETE',
      path: '/api/registrar/config',
      body: undefined,
    });
  });

  it('keeps a configuration that a file provisioned from being changed here', async () => {
    ownership = [
      {
        kind: 'RegistrarConfig',
        resourceId: 'registrar',
        ownership: 'file-managed',
        generation: 1,
        source: 'folder:acme/registrar.json',
      },
    ];
    const settle = await render();
    await settle(() => expect(text()).toContain('Managed by a configuration bundle'));

    expectUnavailable(
      button('Save configuration')!,
      'Managed by folder:acme/registrar.json, read-only'
    );
    expect(button('Delete configuration')).toBeUndefined();
  });

  it('says why the configuration could not be loaded instead of offering to replace it', async () => {
    client.setConfig({
      fetch: async () => json({ statusCode: 503, message: 'Registrar store offline' }, 503),
    });
    await render();

    expect(text()).toContain('The registrar configuration could not be loaded');
    expect(text()).toContain('Registrar store offline');
    expect(page().querySelector('form')).toBeNull();
  });
});
