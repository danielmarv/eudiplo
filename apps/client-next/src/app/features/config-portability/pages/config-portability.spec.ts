import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { client } from '@eudiplo/sdk-core';
import { provideTanStackQuery, QueryClient } from '@tanstack/angular-query-experimental';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type Caller, CallerService } from '../../../core/auth/caller.service';
import { SessionService } from '../../../core/auth/session.service';
import { NotifyService } from '../../../core/notify/notify.service';
import { readBundleFile } from '../data/bundle-file';
import { applyWarnings, changeSide, changeSummary } from '../data/plan-display';
import type { ImportPlan } from '../data/portability-queries';
import { ConfigPortability } from './config-portability';

const plan = (extra: Partial<ImportPlan> = {}): ImportPlan => ({
  tenantId: 'acme',
  mode: 'upsert',
  applicable: true,
  planFingerprint: 'fp-1',
  issues: [],
  items: [
    {
      kind: 'CredentialConfig',
      id: 'pid',
      action: 'update',
      sourceVersion: '2',
      targetVersion: '2',
      migrations: [],
      issues: [],
      changes: [
        { path: '/spec/lifeTime', before: 3600, after: 7200 },
        { path: '/spec/description', before: 'Old' },
      ],
    },
  ],
  ...extra,
});

describe('config portability data', () => {
  it('reads an archive, a bundle or a single document, and refuses anything else', async () => {
    const zip = new File(['PK'], 'config.zip');
    expect(await readBundleFile(zip, 'acme')).toEqual({ archive: zip });

    const bundle = { manifest: { format: 'eudiplo.config-bundle' }, documents: [] };
    expect(await readBundleFile(new File([JSON.stringify(bundle)], 'b.json'), 'acme')).toEqual({
      bundle,
    });

    const document = {
      $schema: 'https://eudiplo.dev/schemas/v1/WebhookEndpointConfigFile.schema.json',
      spec: { id: 'crm', url: 'https://crm.example' },
    };
    const single = await readBundleFile(new File([JSON.stringify(document)], 'crm.json'), 'acme');
    expect(single).toMatchObject({
      bundle: {
        manifest: { tenant: 'acme', resources: [{ kind: 'WebhookEndpoint', id: 'crm' }] },
        documents: [document],
      },
    });

    await expect(readBundleFile(new File(['{}'], 'x.json'), 'acme')).rejects.toThrow(
      'x.json is neither an EUDIPLO configuration bundle nor a configuration document.'
    );
    await expect(readBundleFile(new File(['nope'], 'x.txt'), 'acme')).rejects.toThrow(
      'x.txt is neither a ZIP archive nor JSON.'
    );
  });

  it('sums up changes and warns about removed values and deletions', () => {
    const current = plan({
      items: [
        ...plan().items,
        {
          kind: 'TrustList',
          id: 'old',
          action: 'delete',
          sourceVersion: '1',
          targetVersion: '1',
          migrations: [],
          issues: [],
        },
      ],
    });
    expect(changeSummary(current.items[0])).toBe('2 fields, 1 removed');
    expect(
      changeSide({ path: '/spec/secret', before: '[redacted]', redacted: true }, 'before')
    ).toEqual({ text: 'secret', kind: 'described' });
    expect(applyWarnings(current, 'replace')).toEqual([
      'Replace mode deletes the resources of this bundle source that the bundle leaves out: TrustList/old.',
      'The import removes stored values the bundle leaves out, marked as removed in the plan: CredentialConfig/pid (1 field).',
      'This cannot be undone.',
    ]);
    expect(applyWarnings(plan({ items: [] }), 'upsert')).toEqual([]);
  });
});

describe('config portability page', () => {
  let requests: { method: string; path: string; query: string }[];
  let notify: Record<'success' | 'info' | 'warning' | 'error', ReturnType<typeof vi.fn>>;
  const caller = signal<Caller | undefined>({
    subject: 'acme-admin',
    tenantId: 'acme',
    roles: ['tenant:admin'],
  });
  const page = () => document.body;
  const text = () => page().textContent?.replace(/\s+/g, ' ') ?? '';
  const button = (name: string) =>
    [...page().querySelectorAll<HTMLButtonElement>('button')].find(
      (candidate) => candidate.textContent?.replace(/\s+/g, ' ').trim() === name
    );
  const labelled = (label: string) =>
    page().querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!;
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });

  async function render() {
    const fixture = TestBed.createComponent(ConfigPortability);
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

  async function choose(file: File) {
    const input = page().querySelector<HTMLInputElement>('#bundle-file')!;
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    input.dispatchEvent(new Event('change'));
  }

  beforeEach(() => {
    requests = [];
    notify = { success: vi.fn(), info: vi.fn(), warning: vi.fn(), error: vi.fn() };
    client.setConfig({
      baseUrl: 'http://backend.test',
      fetch: async (request: RequestInfo | URL) => {
        const call = request instanceof Request ? request : new Request(String(request));
        const url = new URL(call.url);
        requests.push({ method: call.method, path: url.pathname, query: url.search });
        switch (url.pathname) {
          case '/api/config-bundles/resources':
            return json([
              {
                tenantId: 'acme',
                kind: 'WebhookEndpoint',
                resourceId: 'crm',
                ownership: 'file-managed',
                generation: 3,
                source: 'folder:acme/webhooks/crm.json',
                createdAt: '2026-11-01T00:00:00Z',
                updatedAt: '2026-11-01T00:00:00Z',
              },
              {
                tenantId: 'acme',
                kind: 'TrustList',
                resourceId: 'issuers',
                ownership: 'detached',
                generation: 1,
                source: 'folder:acme/trust-lists/issuers.json',
                createdAt: '2026-11-01T00:00:00Z',
                updatedAt: '2026-11-01T00:00:00Z',
              },
            ]);
          case '/api/config-bundles/operations':
            return json([
              {
                id: 'op-1',
                tenantId: 'acme',
                mode: 'upsert',
                planFingerprint: 'fp-0',
                status: 'completed',
                activeTenant: null,
                operations: [{ stage: 'apply', kind: 'Tenant', id: 'acme', status: 'done' }],
                revision: 1,
                createdAt: '2026-11-10T00:00:00Z',
                updatedAt: '2026-11-10T00:00:00Z',
              },
            ]);
          case '/api/config-bundles/plan':
            return json(plan(), 201);
          case '/api/config-bundles/import':
            return json(
              {
                ...plan(),
                operationId: 'op-2',
                generatedSecrets: [
                  { kind: 'Client', id: 'shop', path: '/spec/secret', value: 'rotated-secret' },
                ],
              },
              201
            );
          case '/api/config-bundles/resources/WebhookEndpoint/crm/detach':
            return json({}, 201);
          case '/api/config-bundles/resources/TrustList/issuers/reattach/plan':
            return json(plan({ items: [] }));
          default:
            return json([]);
        }
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

  it('plans a bundle first, applies that plan and shows the generated secrets once', async () => {
    const { settle } = await render();
    await settle(() => expect(text()).toContain('WebhookEndpoint/crm'));
    expect(text()).toContain('op-1');

    const bundle = { manifest: { format: 'eudiplo.config-bundle' }, documents: [] };
    await choose(new File([JSON.stringify(bundle)], 'acme.json'));
    await settle(() => expect(text()).toContain('acme.json'));
    button('Plan import')!.click();
    await settle(() => expect(text()).toContain('Ready to apply. Nothing has changed yet.'));
    expect(text()).toContain('2 fields, 1 removed');

    button('Apply import')!.click();
    // The plan removes a stored value, so the apply asks first.
    await settle(() => expect(text()).toContain('removes stored values'));
    [...page().querySelectorAll<HTMLButtonElement>('button')]
      .filter((candidate) => candidate.textContent?.trim() === 'Apply import')
      .at(-1)!
      .click();
    await settle(() => expect(text()).toContain('rotated-secret'));
    expect(requests).toContainEqual(
      expect.objectContaining({
        method: 'POST',
        path: '/api/config-bundles/import',
        query: '?mode=upsert&confirmReplace=false&planFingerprint=fp-1',
      })
    );
    expect(text()).toContain('Applied as operation op-2.');
  });

  it('detaches a file-managed resource after asking', async () => {
    const { settle } = await render();
    await settle(() => expect(text()).toContain('WebhookEndpoint/crm'));
    labelled('Detach WebhookEndpoint/crm').click();
    await settle(() => expect(text()).toContain('imports from its source skip it'));
    [...page().querySelectorAll<HTMLButtonElement>('button')]
      .filter((candidate) => candidate.textContent?.trim() === 'Detach')
      .at(-1)!
      .click();
    await settle(() =>
      expect(notify.success).toHaveBeenCalledWith('WebhookEndpoint/crm detached.')
    );
    expect(requests).toContainEqual(
      expect.objectContaining({
        method: 'POST',
        path: '/api/config-bundles/resources/WebhookEndpoint/crm/detach',
      })
    );
  });

  it('plans the reset of a detached resource before applying it', async () => {
    const { settle } = await render();
    await settle(() => expect(text()).toContain('TrustList/issuers'));
    labelled('Reset TrustList/issuers to its file').click();
    await settle(() => expect(text()).toContain('Reset TrustList/issuers to its file'));
    expect(button('Reset to file')).toBeDefined();
  });
});
