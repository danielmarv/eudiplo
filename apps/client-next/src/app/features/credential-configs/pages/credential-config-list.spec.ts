import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { client } from '@eudiplo/sdk-core';
import { provideTanStackQuery, QueryClient } from '@tanstack/angular-query-experimental';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type Caller, CallerService } from '../../../core/auth/caller.service';
import { SessionService } from '../../../core/auth/session.service';
import { CredentialConfigList } from './credential-config-list';

describe('CredentialConfigList', () => {
  let configs: unknown[] | 'fail';
  let ownership: unknown[] | 'fail';
  const caller = signal<Caller | undefined>(undefined);

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

  const config = (id: string, extra: Record<string, unknown> = {}) => ({
    id,
    config: { format: 'dc+sd-jwt', display: [] },
    fields: [],
    ...extra,
  });

  const page = () => document.body;
  const text = (element: Element = page()) => element.textContent?.replace(/\s+/g, ' ') ?? '';
  const rows = () => [...page().querySelectorAll('tbody tr')];
  const names = () => rows().map((row) => row.querySelector('a')?.textContent?.trim());
  const footer = () => text(page().querySelector('app-table-pagination')!);

  async function render() {
    const fixture = TestBed.createComponent(CredentialConfigList);
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
    configs = [
      config('student-id', {
        config: {
          format: 'dc+sd-jwt',
          display: [{ name: 'Student ID', description: 'Card of Acme University', locale: 'en' }],
        },
        lifeTime: 31_536_000,
        keyBinding: true,
        statusManagement: true,
        schemaMeta: { id: 'schema-1', version: '1.0' },
      }),
      config('mdl', {
        config: { format: 'mso_mdoc', display: [] },
        description: 'Driving licence',
      }),
      config('age-check', { iaeActions: [{ type: 'openid4vp_presentation' }], lifeTime: 86_400 }),
    ];
    ownership = [
      {
        kind: 'CredentialConfig',
        resourceId: 'student-id',
        ownership: 'file-managed',
        generation: 1,
        source: 'folder:acme/student-id.json',
      },
    ];
    caller.set({ subject: 'acme', tenantId: 'acme', roles: ['issuance:manage'] });
    client.setConfig({
      baseUrl: 'http://backend.test',
      fetch: async (request: RequestInfo | URL) => {
        const path = new URL(request instanceof Request ? request.url : String(request)).pathname;
        if (path === '/api/issuer/credentials') {
          return configs === 'fail' ? json({ message: 'Service Unavailable' }, 503) : json(configs);
        }
        if (path === '/api/config-bundles/resources/CredentialConfig') {
          return ownership === 'fail' ? json({ message: 'Forbidden' }, 403) : json(ownership);
        }
        return json([]);
      },
    });
    TestBed.configureTestingModule({
      imports: [CredentialConfigList],
      providers: [
        provideRouter([]),
        provideTanStackQuery(new QueryClient({ defaultOptions: { queries: { retry: false } } })),
        { provide: SessionService, useValue: { getBaseUrl: () => 'http://backend.test' } },
        { provide: CallerService, useValue: { loadedCaller: caller.asReadonly() } },
      ],
    });
  });

  afterEach(() => {
    client.setConfig({ fetch: () => new Promise<Response>(() => undefined) });
    document.body.innerHTML = '';
  });

  it('lists the credential types by name, with their format, lifetime and features', async () => {
    await render();

    expect(names()).toEqual(['age-check', 'mdl', 'Student ID']);
    const student = text(rows()[2]);
    expect(student).toContain('student-id');
    expect(student).toContain('Card of Acme University');
    expect(student).toContain('SD-JWT VC');
    expect(student).toContain('365 days');
    expect(student).toContain('Key binding');
    expect(student).toContain('Revocable');
    expect(text(rows()[1])).toContain('mdoc');
    expect(text(rows()[1])).toContain('No expiry');
    expect(text(rows()[1])).toContain('Driving licence');
    expect(text(rows()[0])).toContain('IAE');
    expect(footer()).toContain('1–3 of 3 credential types');
  });

  it('finds credential types by name, ID or wallet description, and filters by format', async () => {
    const settle = await render();
    const search = page().querySelector<HTMLInputElement>('input[type="search"]')!;

    search.value = 'acme university';
    search.dispatchEvent(new Event('input'));
    await settle(() => expect(names()).toEqual(['Student ID']));

    search.value = '';
    search.dispatchEvent(new Event('input'));
    [...page().querySelectorAll<HTMLButtonElement>('button[aria-pressed]')]
      .find((button) => button.textContent?.includes('mdoc'))!
      .click();
    await settle(() => expect(names()).toEqual(['mdl']));
  });

  it('keeps a credential type that a file provisioned from being edited here, and says why', async () => {
    await render();

    const locked = page().querySelector<HTMLButtonElement>('button[aria-label="Edit student-id"]')!;
    expect(locked.getAttribute('aria-disabled')).toBe('true');
    expect(text(page().querySelector('#locked-student-id')!)).toContain(
      'Managed by folder:acme/student-id.json, read-only'
    );
    expect(page().querySelector('a[href="/student-id/edit"]')).toBeNull();
    expect(page().querySelector('a[href="/mdl/edit"]')).not.toBeNull();
  });

  it('locks nothing when the ownership cannot be looked up', async () => {
    ownership = 'fail';
    await render();

    expect(page().querySelector('a[href="/student-id/edit"]')).not.toBeNull();
    expect(page().querySelector('#locked-student-id')).toBeNull();
  });

  it('links the schema only for those who can open the schema pages', async () => {
    await render();
    expect(page().querySelector('a[href="/schema/schema-1"]')).toBeNull();
    expect(text(rows()[2])).toContain('Schema');

    document.body.innerHTML = '';
    caller.set({
      subject: 'acme',
      tenantId: 'acme',
      roles: ['issuance:manage', 'registrar:manage'],
    });
    await render();
    expect(page().querySelector('a[href="/schema/schema-1"]')).not.toBeNull();
  });

  it('offers to add the first credential type when there is none', async () => {
    configs = [];
    await render();

    expect(text()).toContain('No credential types yet');
    expect(page().querySelector('a[href="/create"]')).not.toBeNull();
  });

  it('says why the list could not be loaded', async () => {
    configs = 'fail';
    await render();

    expect(text()).toContain('The credential types could not be loaded');
    expect(text()).toContain('Service Unavailable');
  });
});
