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
import { IssuerSettings } from './issuer-settings';

const encode = (value: unknown) =>
  btoa(JSON.stringify(value)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

describe('IssuerSettings', () => {
  const now = Math.floor(Date.now() / 1000);
  const jwt = `${encode({ alg: 'ES256', typ: 'rc-wrp+jwt' })}.${encode({ sub: 'acme-registered' })}.c2ln`;
  let settings: Record<string, unknown> | 'fail';
  let reissued: Record<string, unknown> | 'fail';
  let ownership: unknown[];
  let requests: string[];
  let notify: Record<'success' | 'info' | 'warning' | 'error', ReturnType<typeof vi.fn>>;
  const caller = signal<Caller | undefined>(undefined);

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

  const page = () => document.body;
  const text = (element: Element | null = page()) =>
    element?.textContent?.replace(/\s+/g, ' ') ?? '';
  const panel = () => page().querySelector('[role="tabpanel"]:not([hidden])');
  /** The value of the term `label` in `root`. */
  const fact = (root: Element | null, label: string) =>
    text(
      [...(root?.querySelectorAll('dt') ?? [])].find((term) => term.textContent?.trim() === label)
        ?.nextElementSibling ?? null
    ).trim();
  const tab = (name: string) =>
    [...page().querySelectorAll<HTMLButtonElement>('[role="tab"]')].find((button) =>
      button.textContent?.includes(name)
    )!;
  const button = (name: string) =>
    [...page().querySelectorAll<HTMLButtonElement>('button')].find(
      (candidate) => candidate.textContent?.trim() === name
    );

  async function render() {
    const fixture = TestBed.createComponent(IssuerSettings);
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
    settings = {
      display: [
        { name: 'Acme University', locale: 'en', logo: { uri: 'https://acme.example/logo.png' } },
        { name: 'Acme Universität', locale: 'de' },
      ],
      createdAt: '2026-01-05T10:00:00Z',
      updatedAt: '2026-10-01T08:30:00Z',
      batchSize: 5,
      notificationEndpointEnabled: false,
      dPopRequired: true,
      walletAttestationRequired: true,
      walletProviderTrustLists: [],
      walletAttestationStatusCheckMode: 'strict',
      txCodeMaxAttempts: null,
      authorizationServers: [
        { type: 'built-in', id: 'off', enabled: false },
        {
          type: 'chained',
          id: 'keycloak',
          label: 'Acme login',
          upstream: { issuer: 'https://idp.acme.example', clientId: 'eudiplo' },
          requireDPoP: true,
        },
      ],
      registrationCertificate: { enabled: true, mode: 'generate', renewal: 'manual' },
      registrationCertificateCache: { jwt, issuedAt: now - 86_400, expiresAt: now + 90 * 86_400 },
    };
    reissued = { ...settings, registrationCertificateCache: null };
    ownership = [];
    requests = [];
    notify = { success: vi.fn(), info: vi.fn(), warning: vi.fn(), error: vi.fn() };
    caller.set({ subject: 'acme-admin', tenantId: 'acme', roles: ['issuance:manage'] });
    client.setConfig({
      baseUrl: 'http://backend.test',
      fetch: async (request: RequestInfo | URL) => {
        const url = request instanceof Request ? request : new Request(String(request));
        const path = new URL(url.url).pathname;
        requests.push(`${url.method} ${path}`);
        if (path === '/api/issuer/config') {
          return settings === 'fail'
            ? json({ message: 'Service Unavailable' }, 503)
            : json(settings);
        }
        if (path === '/api/issuer/config/registration-cert/reissue') {
          return reissued === 'fail'
            ? json({ message: 'Registrar is not enabled for this tenant' }, 400)
            : json(reissued, 201);
        }
        if (path === '/api/config-bundles/resources/IssuanceConfig') return json(ownership);
        if (path === '/api/config-bundles/resources/IssuanceConfig/issuance/document') {
          return json({ $schema: 'x', spec: { secret: '${ISSUER_SECRET}' } });
        }
        return json([]);
      },
    });
    TestBed.configureTestingModule({
      imports: [IssuerSettings],
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
    vi.restoreAllMocks();
  });

  it('shows how wallets show the issuer, in every language, and the settings of every request', async () => {
    await render();

    const metadata = text(panel());
    expect(metadata).toContain('Acme University');
    expect(page().querySelector('img')?.getAttribute('src')).toBe('https://acme.example/logo.png');
    expect(metadata).toContain('In 2 languages');
    expect([...panel()!.querySelectorAll('li')].map((item) => text(item).trim())).toEqual([
      'enAcme University',
      'deAcme Universität',
    ]);
    expect(fact(panel(), 'Batch size')).toBe('5 credentials per request');
    expect(fact(panel(), 'Notification endpoint')).toBe('Off');
  });

  it('shows the initials when the logo does not load', async () => {
    const { settle } = await render();

    page().querySelector('img')!.dispatchEvent(new Event('error'));
    await settle(() => expect(page().querySelector('img')).toBeNull());
    expect(text(panel())).toContain('AU');
  });

  it('opens the tab the address names', async () => {
    const { fixture, settle } = await render();

    fixture.componentRef.setInput('tab', 'security');
    await settle(() => expect(text(panel())).toContain('Wallet requirements'));
    fixture.componentRef.setInput('tab', 'nonsense');
    await settle(() => expect(text(panel())).toContain('Shown to wallets'));
  });

  it('lists the authorization servers, with the default one and what each enforces', async () => {
    const { settle } = await render();

    tab('Authorization').click();
    await settle(() => expect(text(panel())).toContain('Authorization servers'));
    const [off, chained] = [...panel()!.querySelectorAll('li')];
    expect(text(off.querySelector('h3'))).toContain('Disabled');
    expect(text(off.querySelector('h3'))).not.toContain('Default');
    expect(fact(off, 'Attestation status check')).toBe('Strict (issuer default)');
    expect(fact(off, 'Access token')).toBe('5 minutes (default)');
    expect(text(chained.querySelector('h3'))).toContain('Acme login');
    expect(text(chained.querySelector('h3'))).toContain('Default');
    expect(fact(chained, 'DPoP')).toBe('Required');
    expect(fact(chained, 'Upstream issuer')).toBe('https://idp.acme.example');
    expect(fact(chained, 'Refresh tokens')).toBe('30 days');
  });

  it('warns when there is no authorization server', async () => {
    settings = { ...(settings as object), authorizationServers: [] };
    const { settle } = await render();

    tab('Authorization').click();
    await settle(() => expect(text(panel())).toContain('No authorization servers.'));
  });

  it('shows what the issuer asks of wallets, and warns that no trust list rejects every wallet', async () => {
    const { settle } = await render();

    tab('Security').click();
    await settle(() => expect(text(panel())).toContain('Wallet requirements'));
    expect(fact(panel(), 'DPoP')).toBe('Required');
    expect(fact(panel(), 'Wallet attestation')).toBe('Required');
    expect(fact(panel(), 'Attestation status check')).toBe('Strict');
    expect(fact(panel(), 'Wallet provider trust lists')).toBe('None: every wallet is rejected');
    expect(fact(panel(), 'Failed attempts allowed')).toBe('5 (default)');
  });

  it('shows the registration certificate, decoded, and copies it', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    const { settle } = await render();

    tab('Registration certificate').click();
    await settle(() => expect(text(panel())).toContain('Certificate JWT'));
    const certificate = text(panel());
    expect(text(page().querySelector('[data-testid="certificate-status"]'))).toContain('Active');
    expect(certificate).toContain('Generated at the registrar');
    expect(certificate).toContain('Only with Regenerate now');
    expect(text(page().querySelector('[aria-label="Decoded header"]'))).toContain('"alg": "ES256"');
    expect(text(page().querySelector('[aria-label="Decoded payload"]'))).toContain(
      '"sub": "acme-registered"'
    );

    button('Copy')!.click();
    await settle(() => expect(writeText).toHaveBeenCalledWith(jwt));
  });

  it('regenerates the registration certificate and shows the new state', async () => {
    const { settle } = await render();
    tab('Registration certificate').click();
    await settle(() => expect(button('Regenerate now')).toBeDefined());

    button('Regenerate now')!.click();
    await settle(() =>
      expect(text(page().querySelector('[data-testid="certificate-status"]'))).toContain(
        'Not issued yet'
      )
    );
    expect(requests).toContain('POST /api/issuer/config/registration-cert/reissue');
    expect(notify.success).toHaveBeenCalledWith('Registration certificate regenerated.', {
      description: 'The certificate it replaced, if any, was revoked.',
    });
  });

  it('says why the registration certificate could not be regenerated', async () => {
    reissued = 'fail';
    const { settle } = await render();
    tab('Registration certificate').click();
    await settle(() => expect(button('Regenerate now')).toBeDefined());

    button('Regenerate now')!.click();
    await settle(() =>
      expect(notify.error).toHaveBeenCalledWith(
        expect.stringContaining('Registrar is not enabled for this tenant')
      )
    );
  });

  it('downloads the settings as a configuration file and names the secrets to set', async () => {
    const createObjectURL = vi.fn(() => 'blob:settings');
    Object.assign(URL, { createObjectURL, revokeObjectURL: vi.fn() });
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    const { settle } = await render();

    page().querySelector<HTMLButtonElement>('button[aria-label="Download configuration"]')!.click();
    await settle(() =>
      expect(notify.success).toHaveBeenCalledWith('Configuration downloaded.', {
        duration: 8_000,
        description: 'Its secrets are placeholders: set ISSUER_SECRET before importing it.',
      })
    );
    expect(requests).toContain(
      'GET /api/config-bundles/resources/IssuanceConfig/issuance/document'
    );
  });

  it('keeps settings that a file provisioned from being edited here, and says why', async () => {
    ownership = [
      {
        kind: 'IssuanceConfig',
        resourceId: 'issuance',
        ownership: 'file-managed',
        generation: 3,
        source: 'folder:acme/issuance.json',
      },
    ];
    const { settle } = await render();
    await settle(() => expect(text()).toContain('Managed by a configuration bundle'));

    expect(text()).toContain('Defined in folder:acme/issuance.json');
    expect(page().querySelector('a[href="/edit"]')).toBeNull();
    expectUnavailable(button('Edit')!, 'Managed by folder:acme/issuance.json, read-only');
    expectUnavailable(
      button('Use guided setup')!,
      'Managed by folder:acme/issuance.json, read-only'
    );
  });

  it('says that detached settings are skipped by imports, and who can reset them', async () => {
    ownership = [
      {
        kind: 'IssuanceConfig',
        resourceId: 'issuance',
        ownership: 'detached',
        generation: 3,
        source: 'folder:acme/issuance.json',
      },
    ];
    const { settle } = await render();
    await settle(() => expect(text()).toContain('Detached from folder:acme/issuance.json'));

    expect(text()).toContain(
      'Someone with the tenant:admin role can reset it to the file version.'
    );
    expect(page().querySelector('a[href="/edit"]')).not.toBeNull();
    expect(page().querySelector('a[href="/settings/config-portability"]')).toBeNull();
  });

  it('offers to edit the settings and to set them up step by step', async () => {
    await render();

    expect(page().querySelector('a[href="/edit"]')).not.toBeNull();
    expect(page().querySelector('a[href="/edit?setup=true"]')).not.toBeNull();
    expect(page().querySelector('a[href="/credential-config/create"]')).not.toBeNull();
  });

  it('says why the settings could not be loaded', async () => {
    settings = 'fail';
    await render();

    expect(text()).toContain('The issuer settings could not be loaded');
    expect(text()).toContain('Service Unavailable');
  });
});
