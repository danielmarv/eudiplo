import { signal, type Type } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { client } from '@eudiplo/sdk-core';
import { provideTanStackQuery, QueryClient } from '@tanstack/angular-query-experimental';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type Caller, CallerService } from '../../../core/auth/caller.service';
import { SessionService } from '../../../core/auth/session.service';
import { NotifyService } from '../../../core/notify/notify.service';
import { expectUnavailable } from '../../../shared/testing/unavailable-action';
import { SchemaCreate } from './schema-create';
import { SchemaDetail } from './schema-detail';
import { SchemaList } from './schema-list';

const encode = (value: unknown) =>
  btoa(JSON.stringify(value)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const jwt = (payload: unknown) => `${encode({ alg: 'ES256' })}.${encode(payload)}.c2ln`;

const entry = (version: string, extra: Record<string, unknown> = {}) => ({
  id: 'gym',
  version,
  displayName: 'Gym membership',
  issuer: 'Acme',
  attestationLoS: 'iso_18045_basic',
  bindingType: 'key',
  rulebookURI: 'https://rules.example/gym.md',
  schemaURIs: [
    { id: 's1', formatIdentifier: 'dc+sd-jwt', uri: 'https://registrar.example/files/abc' },
  ],
  trustedAuthorities: [
    {
      id: 't1',
      frameworkType: 'etsi_tl',
      value: 'https://acme.example/issuers/acme/trust-list/tl-1',
    },
  ],
  category: 'identity',
  tags: ['membership'],
  signedJwt: jwt({ id: 'https://catalog.example/attestations/gym/' }),
  createdAt: '2026-10-01T10:00:00Z',
  updatedAt: `2026-10-0${version === '1.0.0' ? 1 : 2}T10:00:00Z`,
  deprecated: false,
  ...extra,
});

describe('schema pages', () => {
  let schemas: Record<string, unknown>[] | 'fail';
  let registrarConfigured: boolean;
  let configs: Record<string, unknown>[];
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
      (candidate) => candidate.textContent?.replace(/\s+/g, ' ').trim() === name
    );
  const field = <T extends HTMLElement = HTMLInputElement>(id: string) =>
    page().querySelector<T>(`#${id}`)!;
  const type = (id: string, value: string) => {
    const input = field(id);
    input.value = value;
    input.dispatchEvent(new Event('input'));
  };
  const choose = (id: string, value: string) => {
    const select = field<HTMLSelectElement>(id);
    select.value = value;
    select.dispatchEvent(new Event('change'));
  };

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
    return { fixture, settle };
  }

  beforeEach(() => {
    schemas = [entry('1.0.0'), entry('1.1.0')];
    registrarConfigured = true;
    configs = [
      {
        id: 'gym-card',
        vct: 'https://acme.example/gym-card',
        schemaMeta: { id: 'https://catalog.example/attestations/gym' },
        config: { format: 'dc+sd-jwt', display: [{ name: 'Gym card' }] },
      },
      {
        id: 'pid',
        vct: 'https://acme.example/pid',
        config: { format: 'dc+sd-jwt', display: [{ name: 'PID' }] },
      },
    ];
    requests = [];
    notify = { success: vi.fn(), info: vi.fn(), warning: vi.fn(), error: vi.fn() };
    caller.set({
      subject: 'acme-admin',
      tenantId: 'acme',
      roles: ['registrar:manage', 'issuance:manage'],
    });
    client.setConfig({
      baseUrl: 'http://backend.test',
      fetch: async (request: RequestInfo | URL) => {
        const call = request instanceof Request ? request : new Request(String(request));
        const url = new URL(call.url);
        const path = url.pathname;
        const body = ['POST', 'PATCH'].includes(call.method)
          ? await call.clone().json()
          : undefined;
        requests.push({ method: call.method, path, body });
        const all = schemas === 'fail' ? [] : schemas;
        if (path === '/api/registrar/config') {
          return registrarConfigured
            ? json({ registrarUrl: 'https://registrar.example' })
            : json({ statusCode: 404, message: 'No registrar configuration found' }, 404);
        }
        if (path === '/api/schema-metadata/mine') {
          return schemas === 'fail' ? json({ message: 'Registrar unreachable' }, 502) : json(all);
        }
        if (path === '/api/schema-metadata/vocabularies') {
          return json({
            version: '1',
            categories: [{ code: 'identity', label: 'Identity', status: 'active' }],
            tags: [
              { code: 'membership', label: 'Membership', status: 'active' },
              { code: 'sports', label: 'Sports', status: 'active' },
            ],
          });
        }
        if (path === '/api/schema-metadata/publish') {
          return json(entry('1.0.0', { id: 'new-schema', displayName: 'PID' }), 201);
        }
        if (path === '/api/schema-metadata/publish-version') {
          return json(entry((body as { config: { version: string } }).config.version), 201);
        }
        if (path === '/api/schema-metadata') {
          const version = url.searchParams.get('version');
          return json(all.filter((item) => item['version'] === version));
        }
        const versionPath =
          /^\/api\/schema-metadata\/([^/]+)\/versions\/([^/]+)(\/deprecation)?$/.exec(path);
        if (versionPath) {
          const found = all.find((item) => item['version'] === versionPath[2])!;
          if (call.method === 'DELETE') return json(undefined, 200);
          if (versionPath[3]) return json({ ...found, deprecated: true });
          return json({ ...found, ...(body as object) });
        }
        if (path === '/api/schema-metadata/gym/versions') return json(all);
        if (path === '/api/schema-metadata/gym') return json(all.at(-1));
        if (path === '/api/issuer/credentials') return json(configs);
        if (path === '/api/trust-list') {
          return json([
            { id: 'tl-1', description: 'Acme issuers', tenantId: 'acme', keyChainId: 'k' },
          ]);
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

  describe('list', () => {
    it('shows one row per schema with its versions, newest first', async () => {
      const { settle } = await render(SchemaList);
      await settle(() => expect(rows()).toHaveLength(1));
      expect(text(rows()[0])).toContain('Gym membership');
      expect(
        [...rows()[0].querySelectorAll('ul a')].map((link) => link.textContent?.trim())
      ).toEqual(['1.1.0', '1.0.0']);
      expect(text()).toContain('1 schema, 2 versions');
    });

    it('says publishing needs issuance:manage', async () => {
      caller.set({ subject: 'registrar', tenantId: 'acme', roles: ['registrar:manage'] });
      const { settle } = await render(SchemaList);
      await settle(() => expect(rows()).toHaveLength(1));
      expectUnavailable(
        button('Publish schema')!,
        'Publishing a schema needs the issuance:manage role.'
      );
    });

    it('asks to connect a registrar first when none is configured', async () => {
      registrarConfigured = false;
      const { settle } = await render(SchemaList);
      await settle(() => expect(text()).toContain('Connect a registrar first'));
      expect(page().querySelector('a[href="/registrar"]')).not.toBeNull();
      expect(requests.some((request) => request.path === '/api/schema-metadata/mine')).toBe(false);
    });

    it('points to the registrar configuration when the schemas cannot be loaded', async () => {
      schemas = 'fail';
      const { settle } = await render(SchemaList);
      await settle(() => expect(text()).toContain('The schemas could not be loaded'));
      expect(page().querySelector('a[href="/registrar"]')).not.toBeNull();
    });
  });

  describe('detail', () => {
    it('shows the version with its trusted authorities and linked credential types', async () => {
      const { settle } = await render(SchemaDetail, { id: 'gym', version: '1.0.0' });
      await settle(() => expect(text()).toContain('Gym card'));
      expect(text()).toContain('Version 1.0.0');
      expect(text()).toContain('Basic (ISO 18045)');
      expect(text()).toContain('https://catalog.example/attestations/gym/versions/1.0.0/jwt');
      expect(page().querySelector('a[href="/trust-list/tl-1"]')).not.toBeNull();
      expect(page().querySelector('a[aria-current="page"]')?.textContent?.trim()).toBe('1.0.0');
    });

    it('says when the asked version does not exist', async () => {
      const { settle } = await render(SchemaDetail, { id: 'gym', version: '9.9.9' });
      await settle(() =>
        expect(notify.info).toHaveBeenCalledWith(
          'There is no version 9.9.9. Showing version 1.1.0 instead.'
        )
      );
    });

    it('publishes a new version rebuilt from the linked credential type and deprecates the shown one', async () => {
      const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
      const { settle } = await render(SchemaDetail, { id: 'gym', version: '1.0.0' });
      await settle(() => expect(text()).toContain('Gym card'));

      button('New version')!.click();
      await settle(() => expect(field('new-version').value).toBe('1.2.0'));
      button('Publish version')!.click();

      await settle(() =>
        expect(navigate).toHaveBeenCalledWith(['/schema', 'gym'], {
          queryParams: { version: '1.2.0' },
        })
      );
      expect(requests).toContainEqual(
        expect.objectContaining({
          method: 'POST',
          path: '/api/schema-metadata/publish-version',
          body: {
            config: expect.objectContaining({
              id: 'https://catalog.example/attestations/gym',
              name: 'Gym membership',
              version: '1.2.0',
              category: 'identity',
              tags: ['membership'],
              schemaURIs: [
                {
                  format: 'dc+sd-jwt',
                  uri: 'https://registrar.example/files/abc',
                  meta: { vct: 'https://acme.example/gym-card' },
                },
              ],
            }),
          },
        })
      );
      expect(requests).toContainEqual({
        method: 'PATCH',
        path: '/api/schema-metadata/gym/versions/1.0.0/deprecation',
        body: {
          deprecated: true,
          message: 'Superseded by version 1.2.0',
          supersededByVersion: '1.2.0',
        },
      });
      expect(notify.success).toHaveBeenCalledWith('Version 1.2.0 published.');
    });

    it('says why it cannot publish without a linked credential type', async () => {
      configs = [];
      const { settle } = await render(SchemaDetail, { id: 'gym', version: '1.0.0' });
      await settle(() => expect(text()).toContain('No credential type links to this schema.'));
      button('New version')!.click();
      await settle(() => expect(button('Publish version')).toBeDefined());
      expectUnavailable(
        button('Publish version')!,
        'Publishing needs exactly one credential type of format dc+sd-jwt linked to this schema, to rebuild its schema URI.'
      );
    });

    it('saves only the changed catalog metadata', async () => {
      const { settle } = await render(SchemaDetail, { id: 'gym', version: '1.0.0' });
      await settle(() => expect(field('tag-sports')).not.toBeNull());
      type('schema-name', 'Gym pass');
      await settle(() => expect(button('Save metadata')!.getAttribute('aria-disabled')).toBeNull());
      button('Save metadata')!.click();
      await settle(() =>
        expect(notify.success).toHaveBeenCalledWith('Catalog metadata of version 1.0.0 saved.')
      );
      expect(requests).toContainEqual({
        method: 'PATCH',
        path: '/api/schema-metadata/gym/versions/1.0.0',
        body: { displayName: 'Gym pass' },
      });
    });

    it('deletes the only version after naming the credential types that still link to it', async () => {
      schemas = [entry('1.0.0')];
      const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
      const { settle } = await render(SchemaDetail, { id: 'gym' });
      await settle(() => expect(text()).toContain('Gym card'));

      button('Delete')!.click();
      await settle(() => expect(button('Delete version')).toBeDefined());
      expect(text()).toContain(
        'It is the only version, and these credential types still link to the schema: Gym card.'
      );
      button('Delete version')!.click();
      await settle(() => expect(navigate).toHaveBeenCalledWith(['/schema']));
      expect(requests).toContainEqual(
        expect.objectContaining({
          method: 'DELETE',
          path: '/api/schema-metadata/gym/versions/1.0.0',
        })
      );
    });
  });

  describe('create', () => {
    it('names what is missing before it publishes', async () => {
      const { settle } = await render(SchemaCreate);
      await settle(() => expect(field('config-pid')).not.toBeNull());
      button('Publish schema')!.click();
      await settle(() =>
        expect(notify.error).toHaveBeenCalledWith(
          'Check the highlighted fields in Schema, Credential types, Trusted authorities.'
        )
      );
      expect(text()).toContain('Select at least one credential type.');
      expect(text()).toContain('Select a trust list or add a root certificate.');
      expect(requests.some((request) => request.method === 'POST')).toBe(false);
    });

    it('publishes the schema of the credential type it was opened for and links it', async () => {
      const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
      const { settle } = await render(SchemaCreate, { credentialConfigId: 'pid' });
      await settle(() => expect(field('trust-list-tl-1')).not.toBeNull());
      type('schema-name', 'PID');
      type('schema-version', '1.0.0');
      type('schema-rulebook', 'https://rules.example/pid.md');
      choose('schema-los', 'iso_18045_high');
      choose('schema-binding', 'key');
      field<HTMLButtonElement>('trust-list-tl-1').click();
      await settle(() =>
        expect(field('trust-list-tl-1').getAttribute('aria-checked')).toBe('true')
      );

      button('Publish schema')!.click();
      await settle(() =>
        expect(navigate).toHaveBeenCalledWith(['/schema', 'new-schema'], {
          queryParams: { version: '1.0.0' },
        })
      );
      expect(requests).toContainEqual({
        method: 'POST',
        path: '/api/schema-metadata/publish',
        body: {
          credentialConfigId: 'pid',
          config: {
            name: 'PID',
            version: '1.0.0',
            rulebookURI: 'https://rules.example/pid.md',
            attestationLoS: 'iso_18045_high',
            bindingType: 'key',
            schemaURIs: [{ credentialConfigId: 'pid' }],
            trustedAuthorities: [{ trustListId: 'tl-1' }],
          },
        },
      });
    });

    it('points to the schema a credential type is linked to already', async () => {
      const { settle } = await render(SchemaCreate, { credentialConfigId: 'gym-card' });
      await settle(() => expect(text()).toContain('is linked to the schema'));
      expect(page().querySelector('a[href="/schema/gym"]')).not.toBeNull();
    });
  });
});
