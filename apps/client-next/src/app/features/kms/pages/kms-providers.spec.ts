import { signal, type Type } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { client } from '@eudiplo/sdk-core';
import { provideTanStackQuery, QueryClient } from '@tanstack/angular-query-experimental';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type Caller, CallerService } from '../../../core/auth/caller.service';
import { SessionService } from '../../../core/auth/session.service';
import { NotifyService } from '../../../core/notify/notify.service';
import type { ConfigOwnership } from '../../../shared/config-ownership/config-ownership';
import { KMS_ROUTES } from '../kms.routes';
import { KmsProviders } from './kms-providers';

describe('KMS providers page', () => {
  let providers: Record<string, unknown>[];
  let health: Record<string, unknown>[];
  let tenantConfig: Record<string, unknown> | null;
  let ownership: ConfigOwnership[];
  let failProviders: boolean;
  let failTenantConfig: boolean;
  let failOwnership: boolean;
  let requests: { method: string; path: string; body?: unknown }[];
  let roles: string[];
  let notify: Record<'success' | 'info' | 'warning' | 'error', ReturnType<typeof vi.fn>>;
  const caller = signal<Caller | undefined>(undefined);

  const json = (body: unknown, status = 200) =>
    new Response(body === undefined ? null : JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });

  const page = () => document.body;
  const text = () => page().textContent?.replace(/\s+/g, ' ') ?? '';
  const button = (name: string) =>
    [...page().querySelectorAll<HTMLButtonElement>('button')].find((candidate) =>
      candidate.textContent?.trim().includes(name)
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
    providers = [
      {
        name: 'vault-prod',
        type: 'vault',
        description: 'Production vault',
        capabilities: {
          canCreate: true,
          canImport: false,
          canDelete: true,
          supportedAlgs: ['ES256', 'ES384'],
          defaultAlg: 'ES256',
        },
      },
    ];
    health = [{ providerId: 'vault-prod', type: 'vault', ok: true, latencyMs: 14 }];
    tenantConfig = {
      defaultProvider: 'vault-tenant',
      providers: [
        {
          id: 'vault-tenant',
          type: 'vault',
          vaultUrl: 'https://vault.example',
          vaultToken: '<redacted>',
        },
      ],
    };
    ownership = [];
    failProviders = false;
    failTenantConfig = false;
    failOwnership = false;
    requests = [];
    roles = ['issuance:manage'];
    notify = { success: vi.fn(), info: vi.fn(), warning: vi.fn(), error: vi.fn() };
    caller.set({ subject: 'issuer', tenantId: 'acme', roles });
    client.setConfig({
      baseUrl: 'http://backend.test',
      fetch: async (request: RequestInfo | URL) => {
        const call = request instanceof Request ? request : new Request(String(request));
        const path = new URL(call.url).pathname;
        const body = ['POST', 'PUT', 'PATCH'].includes(call.method)
          ? await call.clone().json()
          : undefined;
        requests.push({ method: call.method, path, body });

        if (path === '/api/key-chain/providers') {
          return failProviders
            ? json({ statusCode: 503, message: 'Providers offline' }, 503)
            : json({ providers, default: 'vault-prod' });
        }
        if (path === '/api/key-chain/providers/health') return json(health);
        if (path === '/api/key-chain/providers/config' && call.method === 'GET') {
          return failTenantConfig
            ? json({ statusCode: 503, message: 'Config offline' }, 503)
            : json({ tenantConfig, effectiveConfig: { providers } });
        }
        if (path === '/api/key-chain/providers/config' && call.method === 'PUT') {
          tenantConfig = body as Record<string, unknown>;
          return json({ tenantConfig, effectiveConfig: { providers } });
        }
        if (path === '/api/key-chain/providers/config' && call.method === 'DELETE') {
          tenantConfig = null;
          return json(undefined);
        }
        if (path === '/api/config-bundles/resources/KmsConfig') {
          return failOwnership
            ? json({ statusCode: 503, message: 'Ownership offline' }, 503)
            : json(ownership);
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

  it('lists providers and health for key managers without requesting tenant secrets or ownership', async () => {
    await render(KmsProviders);

    expect(text()).toContain('vault-prod');
    expect(text()).toContain('Production vault');
    expect(text()).toContain('14 ms');
    expect(page().querySelector('a[href="/keys/create?kmsProvider=vault-prod"]')).not.toBeNull();
    expect(page().querySelector('section[aria-labelledby="tenant-kms-heading"]')).toBeNull();
    expect(requests.some((request) => request.path.endsWith('/providers/config'))).toBe(false);
    expect(requests.some((request) => request.path.endsWith('/resources/KmsConfig'))).toBe(false);
  });

  it('saves only tenant configuration and confirms resetting it to global defaults', async () => {
    roles = ['tenant:admin'];
    caller.set({ subject: 'admin', tenantId: 'acme', roles });
    const { fixture, settle } = await render(KmsProviders);

    await settle(() => expect(text()).toContain('A tenant-specific configuration is active.'));
    expect(text()).not.toContain('vault-tenant');
    await settle(() => expect(button('Edit JSON')?.getAttribute('aria-disabled')).toBeNull());
    button('Edit JSON')!.click();
    await settle(() =>
      expect(page().querySelector<HTMLTextAreaElement>('#tenant-kms-json')).not.toBeNull()
    );
    const editor = page().querySelector<HTMLTextAreaElement>('#tenant-kms-json')!;
    expect(JSON.parse(editor.value).providers[0].vaultToken).toBe('<redacted>');
    expect(editor.value).not.toContain('vault-prod');

    editor.value = JSON.stringify({
      defaultProvider: 'vault-tenant',
      providers: [
        {
          id: 'vault-tenant',
          type: 'vault',
          vaultUrl: 'https://vault.example',
          vaultToken: '<redacted>',
        },
      ],
    });
    editor.dispatchEvent(new Event('input'));
    (fixture.componentInstance as unknown as { saveTenantConfig: () => void }).saveTenantConfig();
    fixture.detectChanges();
    await settle(() =>
      expect(notify.success).toHaveBeenCalledWith('Tenant KMS configuration saved.')
    );
    expect(requests.find((request) => request.method === 'PUT')?.body).toMatchObject({
      providers: [{ vaultToken: '<redacted>' }],
    });

    button('Reset override')!.click();
    await settle(() => expect(text()).toContain('Reset this tenant override?'));
    button('Reset to global defaults')!.click();
    await settle(() =>
      expect(notify.success).toHaveBeenCalledWith(
        'Tenant KMS configuration reset to the global defaults.'
      )
    );
    await settle(() => expect(text()).toContain('Using the global KMS configuration.'));
    expect(requests.some((request) => request.method === 'DELETE')).toBe(true);
  });

  it('keeps configuration editing and reset unavailable for file-managed KMS config', async () => {
    roles = ['tenants:manage'];
    caller.set({ subject: 'admin', tenantId: 'acme', roles });
    ownership = [
      {
        kind: 'KmsConfig',
        resourceId: 'kms',
        ownership: 'file-managed',
        source: 'folder:acme/kms.json',
        generation: 1,
      },
    ];
    const { settle } = await render(KmsProviders);

    await settle(() => expect(text()).toContain('Managed by a configuration bundle'));
    for (const action of ['Edit JSON', 'Reset override']) {
      expect(button(action)?.getAttribute('aria-disabled')).toBe('true');
    }
    button('Edit JSON')!.click();
    expect(page().querySelector('#tenant-kms-json')).toBeNull();
    expect(requests.some((request) => ['PUT', 'DELETE'].includes(request.method))).toBe(false);
  });

  it('fails closed when KMS configuration ownership cannot be checked', async () => {
    roles = ['tenant:admin'];
    caller.set({ subject: 'admin', tenantId: 'acme', roles });
    failOwnership = true;
    const { settle } = await render(KmsProviders);

    await settle(() => expect(text()).toContain('Configuration ownership could not be checked'));
    expect(button('Edit JSON')?.getAttribute('aria-disabled')).toBe('true');
    button('Edit JSON')!.click();
    expect(page().querySelector('#tenant-kms-json')).toBeNull();
    expect(requests.some((request) => request.method === 'PUT')).toBe(false);
  });

  it('shows provider loading errors and empty state instead of a blank table', async () => {
    failProviders = true;
    await render(KmsProviders);
    expect(text()).toContain('KMS providers could not be loaded');
    expect(text()).toContain('Providers offline');

    document.body.innerHTML = '';
    providers = [];
    failProviders = false;
    TestBed.inject(QueryClient).clear();
    await render(KmsProviders);
    expect(text()).toContain('No KMS providers are configured');
  });

  it('reports a separate error and retry for tenant configuration failures', async () => {
    roles = ['tenant:admin'];
    caller.set({ subject: 'admin', tenantId: 'acme', roles });
    failTenantConfig = true;
    await render(KmsProviders);

    expect(text()).toContain('The tenant KMS configuration could not be loaded');
    expect(text()).toContain('Config offline');
    expect(button('Retry') ?? button('Retry loading')).not.toBeNull();
  });

  it('protects the page route with key-management roles', () => {
    expect(KMS_ROUTES[0].canActivate).toHaveLength(1);
  });
});
