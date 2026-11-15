import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { client, type CredentialConfig } from '@eudiplo/sdk-core';
import { provideTanStackQuery, QueryClient } from '@tanstack/angular-query-experimental';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type Caller, CallerService } from '../../../core/auth/caller.service';
import { SessionService } from '../../../core/auth/session.service';
import { NotifyService } from '../../../core/notify/notify.service';
import { claimRows } from '../data/claim-rows';
import { CredentialConfigDetail } from './credential-config-detail';

const pid = {
  id: 'pid',
  description: 'Person identification data',
  lifeTime: 86400,
  keyBinding: true,
  statusManagement: true,
  vct: 'urn:eudi:pid:1',
  schemaMeta: { id: 'https://registrar.example/attestations/pid/' },
  config: {
    format: 'dc+sd-jwt',
    display: [
      { name: 'PID', locale: 'en-US', background_color: '#123456', text_color: '#FFFFFF' },
      { name: 'PID again', locale: 'EN-us' },
    ],
  },
  fields: [
    { path: ['given_name'], type: 'string', mandatory: true, disclosable: true },
    {
      path: ['age'],
      type: 'integer',
      mandatory: false,
      disclosable: false,
      defaultValue: 18,
      constraints: { minimum: 0 },
    },
  ],
} as unknown as CredentialConfig;

describe('claim rows', () => {
  it('reads the claims from the fields', () => {
    expect(claimRows(pid)).toEqual([
      expect.objectContaining({
        key: 'age',
        type: 'integer',
        mandatory: false,
        disclosable: 'No',
        hasDefaultValue: true,
        defaultValue: 18,
        constraints: { minimum: 0 },
      }),
      expect.objectContaining({ key: 'given_name', mandatory: true, disclosable: 'Yes' }),
    ]);
  });

  it('merges the claims, disclosure frame and schema of a credential type without fields', () => {
    const legacy = {
      id: 'old',
      config: { format: 'dc+sd-jwt' },
      claims: { name: 'Ada', address: { city: 'Berlin' } },
      disclosureFrame: { _sd: ['name'] },
      schema: {
        type: 'object',
        required: ['name'],
        properties: { name: { type: 'string' }, address: { type: 'object' } },
      },
    } as unknown as CredentialConfig;
    expect(claimRows(legacy)).toEqual([
      expect.objectContaining({ key: 'address.city', disclosable: 'No', type: 'string' }),
      expect.objectContaining({ key: 'name', disclosable: 'Yes', mandatory: true, type: 'string' }),
    ]);
  });
});

describe('credential type detail', () => {
  let requests: { method: string; path: string; body?: unknown }[];
  let notify: Record<'success' | 'info' | 'warning' | 'error', ReturnType<typeof vi.fn>>;
  const caller = signal<Caller | undefined>({
    subject: 'admin',
    tenantId: 'acme',
    roles: ['issuance:manage', 'registrar:manage'],
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
    const fixture = TestBed.createComponent(CredentialConfigDetail);
    fixture.componentRef.setInput('id', 'pid');
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
        requests.push({ method: call.method, path, body: raw ? JSON.parse(raw) : undefined });
        if (path === '/api/issuer/credentials/pid') {
          if (call.method === 'DELETE') return json(undefined, 200);
          if (call.method === 'PATCH') return json({ ...pid, schemaMeta: undefined });
          return json(pid);
        }
        if (path === '/api/status-list') {
          return json([{ id: 'list-1', credentialConfigurationId: 'pid' }]);
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

  it('shows what wallets receive and links the schema', async () => {
    const { settle } = await render();
    await settle(() => expect(text()).toContain('Person identification data'));
    expect(text()).toContain('urn:eudi:pid:1');
    expect(page().querySelector('a[href="/schema/pid"]')).not.toBeNull();
    expect(text()).toContain('Claims (2)');
  });

  it('unlinks the schema after asking', async () => {
    const { settle } = await render();
    await settle(() =>
      expect(page().querySelector('[aria-label="Unlink the schema"]')).not.toBeNull()
    );
    page().querySelector<HTMLButtonElement>('[aria-label="Unlink the schema"]')!.click();
    await settle(() => expect(button('Unlink schema')).toBeDefined());
    button('Unlink schema')!.click();
    await settle(() => expect(notify.success).toHaveBeenCalledWith('Schema unlinked.'));
    expect(requests).toContainEqual({
      method: 'PATCH',
      path: '/api/issuer/credentials/pid',
      body: { schemaMeta: null },
    });
  });

  it('deletes the credential type after asking', async () => {
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    const { settle } = await render();
    await settle(() => expect(button('Delete')).toBeDefined());
    button('Delete')!.click();
    await settle(() => expect(button('Delete credential type')).toBeDefined());
    button('Delete credential type')!.click();
    await settle(() => expect(navigate).toHaveBeenCalledWith(['/credential-config']));
  });
});
