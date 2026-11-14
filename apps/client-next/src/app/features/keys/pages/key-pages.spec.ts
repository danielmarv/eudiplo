import { signal, type Type } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { client } from '@eudiplo/sdk-core';
import { provideTanStackQuery, QueryClient } from '@tanstack/angular-query-experimental';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type Caller, CallerService } from '../../../core/auth/caller.service';
import { SessionService } from '../../../core/auth/session.service';
import { NotifyService } from '../../../core/notify/notify.service';
import { KeyCreate } from './key-create';
import { KeyDetail } from './key-detail';
import { KeyEdit } from './key-edit';
import { KeyList } from './key-list';

describe('key pages', () => {
  const jwk = { kty: 'EC', crv: 'P-256', x: 'x', y: 'y' };
  const certificate = (days: number) => ({
    pem: '-----BEGIN CERTIFICATE-----',
    subject: 'CN=Acme',
    issuer: 'CN=Acme',
    notBefore: '2026-01-01T00:00:00Z',
    notAfter: new Date(Date.now() + days * 86_400_000).toISOString(),
  });
  let keys: Record<string, unknown>[];
  let defaults: Record<string, unknown>;
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
  const rows = () => [...page().querySelectorAll('tbody tr')];
  const button = (name: string) =>
    [...page().querySelectorAll<HTMLButtonElement>('button')].find(
      (candidate) => candidate.textContent?.trim() === name
    );
  const labelled = (name: string) => page().querySelector<HTMLElement>(`[aria-label="${name}"]`)!;

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
    return settle;
  }

  beforeEach(() => {
    keys = [
      {
        id: 'credential-signing',
        usageType: 'attestation',
        type: 'internalChain',
        description: 'Credential signing key',
        kmsProvider: 'db',
        alg: 'ES256',
        rootCertificate: certificate(3000),
        activePublicKey: jwk,
        activeCertificate: certificate(300),
        rotationPolicy: { enabled: true, intervalDays: 30, certValidityDays: 365 },
        createdAt: '2026-01-05T10:00:00Z',
        updatedAt: '2026-01-05T10:00:00Z',
      },
      {
        id: 'access-reader',
        usageType: 'access',
        type: 'standalone',
        description: 'Access certificate',
        kmsProvider: 'vault',
        activePublicKey: jwk,
        activeCertificate: certificate(300),
        rotationPolicy: { enabled: false },
        createdAt: '2026-02-05T10:00:00Z',
        updatedAt: '2026-02-05T10:00:00Z',
      },
    ];
    defaults = { defaultAccessKeyChainId: 'access-reader', keyChainId: 'access-reader' };
    ownership = [];
    requests = [];
    notify = { success: vi.fn(), info: vi.fn(), warning: vi.fn(), error: vi.fn() };
    caller.set({ subject: 'admin', tenantId: 'acme', roles: ['keys:manage', 'tenant:admin'] });
    client.setConfig({
      baseUrl: 'http://backend.test',
      fetch: async (request: RequestInfo | URL) => {
        const call = request instanceof Request ? request : new Request(String(request));
        const path = new URL(call.url).pathname;
        const raw = ['POST', 'PUT', 'PATCH'].includes(call.method) ? await call.clone().text() : '';
        const body = raw ? JSON.parse(raw) : undefined;
        requests.push({ method: call.method, path, body });
        if (path === '/api/key-chain' && call.method === 'POST')
          return json({ id: 'new-key' }, 201);
        if (path === '/api/key-chain') return json(keys);
        if (path === '/api/key-chain/providers') {
          return json({
            default: 'db',
            providers: [
              {
                name: 'db',
                type: 'db',
                capabilities: {
                  canCreate: true,
                  canImport: true,
                  canDelete: true,
                  supportedAlgs: ['ES256', 'ES384'],
                  defaultAlg: 'ES256',
                },
              },
            ],
          });
        }
        if (path === '/api/key-chain/access/default') {
          if (call.method === 'PUT') {
            const id = (body as { defaultAccessKeyChainId: string | null }).defaultAccessKeyChainId;
            defaults = id
              ? { defaultAccessKeyChainId: id, keyChainId: id }
              : { keyChainId: 'access-reader' };
          }
          return json(defaults);
        }
        if (path === '/api/registrar/config')
          return json({ statusCode: 404, message: 'None' }, 404);
        if (path.startsWith('/api/config-bundles/resources/')) return json(ownership);
        const id = /^\/api\/key-chain\/([^/]+)(\/rotate)?$/.exec(path);
        if (id) {
          const key = keys.find((entry) => entry['id'] === id[1]);
          if (!key) return json({ statusCode: 404, message: 'Not found' }, 404);
          if (call.method === 'DELETE') {
            keys = keys.filter((entry) => entry !== key);
            return json(undefined);
          }
          if (call.method === 'POST' || call.method === 'PUT') return json(undefined);
          return json(key);
        }
        return json([]);
      },
    });
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideTanStackQuery(new QueryClient({ defaultOptions: { queries: { retry: false } } })),
        { provide: SessionService, useValue: { getBaseUrl: () => 'http://backend.test' } },
        {
          provide: CallerService,
          useValue: {
            loadedCaller: caller.asReadonly(),
            hasRole: (role: string | string[]) =>
              [role].flat().some((entry) => caller()?.roles.includes(entry)),
          },
        },
        { provide: NotifyService, useValue: notify },
      ],
    });
  });

  afterEach(() => {
    client.setConfig({ fetch: () => new Promise<Response>(() => undefined) });
    document.body.innerHTML = '';
  });

  describe('list', () => {
    it('lists the key chains by name, sortable, with their usage and the default access key', async () => {
      await render(KeyList);

      expect(rows().map((row) => row.querySelector('a')?.textContent?.trim())).toEqual([
        'Access certificate',
        'Credential signing key',
      ]);
      expect(text(rows()[0])).toContain('Default');
      expect(text(rows()[0])).toContain('Wallet access certificate');
      expect(text(rows()[1])).toContain('Internal chain');
      expect(text(page().querySelector('app-table-pagination'))).toContain('1–2 of 2 key chains');
    });

    it('filters by usage', async () => {
      const settle = await render(KeyList);
      const usage = page().querySelector<HTMLSelectElement>('#key-filter-usage')!;

      usage.value = 'attestation';
      usage.dispatchEvent(new Event('change'));
      await settle(() => expect(rows()).toHaveLength(1));
      expect(text(rows()[0])).toContain('Credential signing key');
    });

    it('keeps a key chain a file provisioned from being edited, rotated or deleted here', async () => {
      ownership = [
        {
          kind: 'KeyChain',
          resourceId: 'credential-signing',
          ownership: 'file-managed',
          source: 'folder:acme/keys.json',
        },
      ];
      const settle = await render(KeyList);
      await settle(() => expect(text()).toContain('File managed'));

      expect(page().querySelector('a[href="/credential-signing/edit"]')).toBeNull();
      labelled('Delete key chain Credential signing key').click();
      expect(notify.error).toHaveBeenCalledWith('Managed by folder:acme/keys.json, read-only');
      expect(requests.some((call) => call.method === 'DELETE')).toBe(false);
    });

    it('refuses to delete the default access key chain, and deletes another after asking', async () => {
      const settle = await render(KeyList);

      labelled('Delete key chain Access certificate').click();
      expect(notify.error).toHaveBeenCalledWith(
        expect.stringContaining('This is the tenant’s default access key chain')
      );

      labelled('Delete key chain Credential signing key').click();
      await settle(() => expect(button('Delete key chain')).toBeDefined());
      button('Delete key chain')!.click();
      await settle(() => expect(rows()).toHaveLength(1));
      expect(requests).toContainEqual({
        method: 'DELETE',
        path: '/api/key-chain/credential-signing',
      });
    });
  });

  describe('detail', () => {
    it('shows the key chain, rotates it after asking and shows it as JSON', async () => {
      const settle = await render(KeyDetail, { keyId: 'credential-signing' });

      expect(text()).toContain('Credential signing key');
      expect(text()).toContain('Rotation policy');
      button('Rotate')!.click();
      await settle(() => expect(button('Rotate key chain')).toBeDefined());
      button('Rotate key chain')!.click();
      await settle(() =>
        expect(requests).toContainEqual({
          method: 'POST',
          path: '/api/key-chain/credential-signing/rotate',
          body: undefined,
        })
      );

      labelled('View as JSON').click();
      await settle(() =>
        expect(text(page().querySelector('[aria-label="Key chain as JSON"]'))).toContain(
          '"usageType": "attestation"'
        )
      );
    });

    it('stops using an access key chain as the default', async () => {
      const settle = await render(KeyDetail, { keyId: 'access-reader' });

      labelled('Stop using key chain Access certificate as default access key chain').click();
      await settle(() =>
        expect(requests).toContainEqual({
          method: 'PUT',
          path: '/api/key-chain/access/default',
          body: { defaultAccessKeyChainId: null },
        })
      );
    });

    it('says when there is no such key chain', async () => {
      await render(KeyDetail, { keyId: 'missing' });

      expect(text()).toMatch(/could not be loaded|There is no key chain/);
    });
  });

  describe('edit', () => {
    it('saves the description and the rotation policy of an internal chain', async () => {
      const settle = await render(KeyEdit, { keyId: 'credential-signing' });
      vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
      await settle(() =>
        expect(page().querySelector<HTMLInputElement>('#rotation-days')?.value).toBe('30')
      );

      const days = page().querySelector<HTMLInputElement>('#rotation-days')!;
      days.value = '60';
      days.dispatchEvent(new Event('input'));
      button('Save changes')!.click();
      await settle(() =>
        expect(requests.find((call) => call.method === 'PUT')).toEqual({
          method: 'PUT',
          path: '/api/key-chain/credential-signing',
          body: {
            description: 'Credential signing key',
            rotationPolicy: { enabled: true, intervalDays: 60, certValidityDays: 365 },
          },
        })
      );
    });
  });

  describe('create', () => {
    it('creates a credential signing chain step by step, numbering the steps it has', async () => {
      const settle = await render(KeyCreate);
      const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
      const steps = () =>
        [...page().querySelectorAll('[aria-label="Key creation steps"] li')].map((step) =>
          text(step).trim()
        );

      expect(steps()).toEqual(['1 Usage', '2 Configure']);
      [...page().querySelectorAll('label')]
        .find((label) => label.textContent?.includes('Credential signing'))!
        .querySelector<HTMLInputElement>('input')!
        .click();
      await settle(() =>
        expect(steps()).toEqual(['1 Usage', '2 Key and certificate', '3 Configure'])
      );
      button('Choose key setup')!.click();
      await settle(() => expect(button('Configure key')).toBeDefined());
      button('Configure key')!.click();
      await settle(() => expect(steps()[0]).toContain('Done'));

      page().querySelector<HTMLButtonElement>('button[type="submit"]')!.click();
      await settle(() => expect(navigate).toHaveBeenCalledWith(['/keys', 'new-key']));
      expect(requests.find((call) => call.method === 'POST')?.body).toMatchObject({
        usageType: 'attestation',
        type: 'internalChain',
        kmsProvider: 'db',
        alg: 'ES256',
        rotationPolicy: { enabled: true, intervalDays: 30, certValidityDays: 365 },
      });
    });
  });
});
