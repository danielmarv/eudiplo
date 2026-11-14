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
import { VerificationRequest } from './verification-request';

describe('VerificationRequest', () => {
  let configs: unknown[] | 'fail';
  let keyChains: unknown[];
  let session: Record<string, unknown>;
  let requests: { method: string; path: string; body?: unknown }[];
  let notify: Record<'success' | 'info' | 'warning' | 'error', ReturnType<typeof vi.fn>>;
  const caller = signal<Caller | undefined>(undefined);

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

  const page = () => document.body;
  const text = (element: Element | null = page()) =>
    element?.textContent?.replace(/\s+/g, ' ') ?? '';
  const button = (name: string) =>
    [...page().querySelectorAll<HTMLButtonElement>('button')].find(
      (candidate) => candidate.textContent?.trim() === name
    );
  const radio = (label: string) =>
    [...page().querySelectorAll('label')]
      .find((candidate) => candidate.textContent?.includes(label))!
      .querySelector<HTMLInputElement>('input[type="radio"]')!;

  async function render(inputs: Record<string, unknown> = {}) {
    const fixture = TestBed.createComponent(VerificationRequest);
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
    configs = [
      {
        id: 'age-check',
        description: 'Over 18',
        dcql_query: {
          credentials: [
            {
              id: 'pid',
              format: 'dc+sd-jwt',
              meta: { vct_values: ['urn:eudi:pid:1'] },
              claims: [{}],
            },
          ],
        },
        allowedOrigins: ['https://shop.example'],
      },
      { id: 'employee', dcql_query: { credentials: [] }, accessKeyChainId: 'hr-reader' },
    ];
    keyChains = [
      { id: 'reader', usageType: 'access', activeCertificate: { pem: 'PEM' } },
      { id: 'hr-reader', usageType: 'access' },
    ];
    session = {
      id: 'session-1',
      status: 'completed',
      outcome: {
        result: 'success',
        credentials: [{ id: 'pid', verified: true, format: 'dc+sd-jwt' }],
      },
      credentials: [
        {
          id: 'pid',
          values: [{ vct: 'urn:eudi:pid:1', iss: 'https://pid.example', age_over_18: true }],
        },
      ],
    };
    requests = [];
    notify = { success: vi.fn(), info: vi.fn(), warning: vi.fn(), error: vi.fn() };
    caller.set({
      subject: 'shop',
      tenantId: 'acme',
      roles: ['presentation:request', 'presentation:manage'],
    });
    client.setConfig({
      baseUrl: 'http://backend.test',
      fetch: async (request: RequestInfo | URL) => {
        const call = request instanceof Request ? request : new Request(String(request));
        const path = new URL(call.url).pathname;
        const body = call.method === 'POST' ? await call.clone().json() : undefined;
        requests.push({ method: call.method, path, body });
        if (path === '/api/verifier/config') {
          return configs === 'fail' ? json({ message: 'Service Unavailable' }, 503) : json(configs);
        }
        if (path === '/api/key-chain') return json(keyChains);
        if (path === '/api/key-chain/access/default') return json({ keyChainId: 'reader' });
        if (path === '/api/verifier/offer') {
          return json({ uri: 'openid4vp://?request_uri=x', session: 'session-1' }, 201);
        }
        if (path === '/api/session/session-1') return json(session);
        return json([]);
      },
    });
    TestBed.configureTestingModule({
      imports: [VerificationRequest],
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

  it('creates a request for the chosen configuration and shows what the wallet shared', async () => {
    const settle = await render();

    expect(text()).toContain('urn:eudi:pid:11 claim');
    radio('age-check').click();
    await settle(() => expect(button('Create request')?.getAttribute('aria-disabled')).toBeNull());
    button('Create request')!.click();

    await settle(() => expect(text()).toContain('Presentation verified'));
    expect(requests.find((call) => call.path === '/api/verifier/offer')?.body).toEqual({
      requestId: 'age-check',
      response_type: 'uri',
    });
    expect(text()).toContain('openid4vp://?request_uri=x');
    expect(text()).toContain('What the wallet shared');
    expect(text()).toContain('age_over_18');
    expect(text()).toContain('issued by https://pid.example');
  });

  it('says why a configuration whose access certificate is missing cannot be requested', async () => {
    const settle = await render();

    radio('employee').click();
    await settle(() =>
      expect(text(page().querySelector('[data-testid="readiness"]'))).toContain(
        'The access key chain hr-reader has no active access certificate'
      )
    );
    expectUnavailable(
      button('Create request')!,
      'The access key chain hr-reader has no active access certificate. Create or renew it first.'
    );
    button('Create request')!.click();
    expect(requests.some((call) => call.path === '/api/verifier/offer')).toBe(false);
  });

  it('binds a Digital Credentials API request to this origin, and says when it is not allowed', async () => {
    const settle = await render();

    radio('employee').click();
    keyChains = [{ id: 'hr-reader', usageType: 'access', activeCertificate: { pem: 'PEM' } }];
    TestBed.inject(QueryClient).invalidateQueries();
    radio('age-check').click();
    radio('Digital Credentials API').click();
    await settle(() =>
      expect(text(page().querySelector('[data-testid="origin-problem"]'))).toContain(
        `does not list this page's origin, ${location.origin}`
      )
    );

    radio('employee').click();
    await settle(() => expect(button('Create request')?.getAttribute('aria-disabled')).toBeNull());
    button('Create request')!.click();
    await settle(() => expect(text()).toContain('Ask the wallet on this device'));
    expect(requests.find((call) => call.path === '/api/verifier/offer')?.body).toEqual({
      requestId: 'employee',
      response_type: 'dc-api',
      expected_origin: location.origin,
    });
  });

  it('sends other transaction data and the chosen client identifier', async () => {
    const settle = await render();
    radio('age-check').click();

    const scheme = page().querySelector<HTMLSelectElement>('#client-id-scheme')!;
    scheme.value = 'x509_san_dns';
    scheme.dispatchEvent(new Event('change'));
    page().querySelector<HTMLButtonElement>('#override-transaction-data')!.click();
    await settle(() => expect(page().querySelector('#transaction-data')).not.toBeNull());
    const editor = page().querySelector<HTMLTextAreaElement>('#transaction-data')!;
    editor.value = '[{"type":"payment"}]';
    editor.dispatchEvent(new Event('input'));
    button('Create request')!.click();
    await settle(() => expect(text()).toContain('Entry 1 needs "credential_ids"'));

    editor.value = '[{"type":"payment","credential_ids":["pid"]}]';
    editor.dispatchEvent(new Event('input'));
    button('Create request')!.click();
    await settle(() =>
      expect(requests.find((call) => call.path === '/api/verifier/offer')?.body).toEqual({
        requestId: 'age-check',
        response_type: 'uri',
        clientIdScheme: 'x509_san_dns',
        transaction_data: [{ type: 'payment', credential_ids: ['pid'] }],
      })
    );
  });

  it('requests the configuration the address names at once', async () => {
    const settle = await render({ id: 'age-check' });

    await settle(() =>
      expect(requests.find((call) => call.path === '/api/verifier/offer')?.body).toMatchObject({
        requestId: 'age-check',
      })
    );
  });

  it('offers to create the first configuration, and says why they could not be loaded', async () => {
    configs = [];
    await render();
    expect(text()).toContain('No presentation configurations yet');
    expect(page().querySelector('a[href="/presentation-config/create"]')).not.toBeNull();

    document.body.innerHTML = '';
    configs = 'fail';
    TestBed.inject(QueryClient).clear();
    await render();
    expect(text()).toContain('The presentation configurations could not be loaded');
  });
});
