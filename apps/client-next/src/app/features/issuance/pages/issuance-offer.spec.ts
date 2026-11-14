import { signal } from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import { client } from '@eudiplo/sdk-core';
import { FormlyForm } from '@ngx-formly/core';
import { provideTanStackQuery, QueryClient } from '@tanstack/angular-query-experimental';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type Caller, CallerService } from '../../../core/auth/caller.service';
import { SessionService } from '../../../core/auth/session.service';
import { NotifyService } from '../../../core/notify/notify.service';
import { provideSchemaForms } from '../../../shared/forms/schema-form/schema-form';
import { IssuanceOffer } from './issuance-offer';

describe('IssuanceOffer', () => {
  let configs: unknown[];
  let servers: unknown[];
  let providers: unknown[] | 'fail';
  let posted: unknown[];
  /** Whether the offer's answer waits until a test releases it. */
  let holdOffer: boolean;
  let release: (() => void) | undefined;
  let notify: Record<'success' | 'info' | 'warning' | 'error', ReturnType<typeof vi.fn>>;
  let fixture: ComponentFixture<IssuanceOffer>;
  const caller = signal<Caller | undefined>(undefined);

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

  const studentId = {
    id: 'student-id',
    description: 'University student card',
    config: { format: 'dc+sd-jwt' },
    fields: [
      {
        path: ['given_name'],
        type: 'string',
        mandatory: true,
        defaultValue: 'Erika',
        display: [{ locale: 'en', name: 'Given name' }],
      },
      { path: ['student_number'], type: 'integer', mandatory: true },
    ],
  };
  const mdl = {
    id: 'mdl',
    config: { format: 'mso_mdoc' },
    fields: [
      {
        path: ['org.iso.18013.5.1', 'family_name'],
        namespace: 'org.iso.18013.5.1',
        type: 'string',
        mandatory: true,
      },
    ],
  };
  const ageCheck = {
    id: 'age-check',
    config: { format: 'dc+sd-jwt' },
    iaeActions: [{ type: 'openid4vp_presentation' }],
    fields: [],
  };

  const page = () => document.body;
  const text = () => page().textContent?.replace(/\s+/g, ' ') ?? '';
  const button = (name: string | RegExp) =>
    [...page().querySelectorAll<HTMLButtonElement>('button')].find((candidate) => {
      const label = candidate.getAttribute('aria-label') ?? candidate.textContent?.trim() ?? '';
      return typeof name === 'string' ? label === name : name.test(label);
    });
  /** The control a label names, by the start of the label's text. */
  const field = <T extends HTMLElement = HTMLInputElement>(label: string) => {
    const element = [...page().querySelectorAll('label')].find((candidate) =>
      candidate.textContent?.trim().startsWith(label)
    );
    return document.getElementById(element!.htmlFor) as T;
  };
  const type = (input: HTMLInputElement, value: string) => {
    input.value = value;
    input.dispatchEvent(new Event('input'));
  };

  async function settle(check: () => void = () => undefined) {
    await vi.waitFor(async () => {
      await fixture.whenStable();
      fixture.detectChanges();
      check();
    });
  }

  async function render() {
    fixture = TestBed.createComponent(IssuanceOffer);
    document.body.appendChild(fixture.nativeElement);
    fixture.detectChanges();
    await settle(() =>
      expect(page().querySelector('nav[aria-label="Steps of the offer"]')).not.toBeNull()
    );
  }

  async function chooseFlow(flow: string) {
    page().querySelector<HTMLInputElement>(`input[name="flow"][value="${flow}"]`)!.click();
    await settle();
  }

  async function next() {
    button('Next')!.click();
    await settle();
  }

  async function choose(...ids: string[]) {
    for (const id of ids) {
      page().querySelector<HTMLElement>(`#credential-${id}`)!.click();
      await settle();
    }
  }

  beforeEach(() => {
    configs = [studentId, mdl, ageCheck];
    servers = [
      { type: 'built-in', id: 'built-in', label: 'EUDIPLO' },
      { type: 'external', id: 'keycloak', issuer: 'https://idp.test', label: 'Keycloak' },
      { type: 'chained', id: 'bank', label: 'Bank login', upstream: {} },
    ];
    providers = [{ id: 'campus', name: 'Campus directory', tenantId: 'acme' }];
    posted = [];
    holdOffer = false;
    release = undefined;
    notify = { success: vi.fn(), info: vi.fn(), warning: vi.fn(), error: vi.fn() };
    caller.set({ subject: 'acme-console', tenantId: 'acme', roles: ['issuance:offer'] });
    history.replaceState(null, '');
    client.setConfig({
      baseUrl: 'http://backend.test',
      fetch: async (request: RequestInfo | URL) => {
        const req = request instanceof Request ? request : new Request(String(request));
        const path = new URL(req.url).pathname;
        if (path === '/api/issuer/credentials') return json(configs);
        if (path === '/api/issuer/config')
          return json({ authorizationServers: servers, display: [] });
        if (path === '/api/issuer/attribute-providers') {
          return providers === 'fail' ? json({ message: 'Forbidden' }, 403) : json(providers);
        }
        if (path === '/api/issuer/offer') {
          posted.push(await req.json());
          if (holdOffer) await new Promise<void>((resolve) => (release = resolve));
          return json(
            { uri: 'openid-credential-offer://?credential_offer_uri=x', session: 's-1' },
            201
          );
        }
        if (path === '/api/session/s-1') {
          return json({ id: 's-1', status: 'active', notifications: [], txCodeFailedAttempts: 0 });
        }
        return json([]);
      },
    });
    TestBed.configureTestingModule({
      imports: [IssuanceOffer],
      providers: [
        provideRouter([]),
        provideTanStackQuery(new QueryClient({ defaultOptions: { queries: { retry: false } } })),
        provideSchemaForms(),
        { provide: SessionService, useValue: { getBaseUrl: () => 'http://backend.test' } },
        { provide: CallerService, useValue: { loadedCaller: caller.asReadonly() } },
        { provide: NotifyService, useValue: notify },
      ],
    });
  });

  afterEach(() => {
    client.setConfig({ fetch: () => new Promise<Response>(() => undefined) });
    document.body.innerHTML = '';
    history.replaceState(null, '');
  });

  describe('credentials', () => {
    it('offers only the credentials of the flow, and starts over when the flow changes', async () => {
      await render();
      await next();
      expect(page().querySelector('#credential-student-id')).not.toBeNull();
      expect(page().querySelector('#credential-age-check')).toBeNull();
      await choose('student-id');

      button('Back')!.click();
      await settle();
      await chooseFlow('authorization_code_iae');
      await next();

      expect(page().querySelector('#credential-age-check')).not.toBeNull();
      expect(page().querySelector('#credential-student-id')).toBeNull();
      expect(page().querySelector('[aria-label="Chosen credentials"]')).toBeNull();
    });

    it('finds credentials by ID or description, in any case', async () => {
      await render();
      await next();
      const search = page().querySelector<HTMLInputElement>('#credential-search')!;

      type(search, 'STUDENT CARD');
      await settle();
      // "student card" is in the description only.
      expect(page().querySelector('#credential-mdl')).toBeNull();
      type(search, 'stud');
      await settle();
      expect(page().querySelector('#credential-student-id')).not.toBeNull();
      type(search, 'nothing');
      await settle();
      expect(text()).toContain('No credential matches “nothing”.');
    });

    it('says on Next that a credential is missing, and stays', async () => {
      await render();
      await next();
      await next();

      expect(notify.error).toHaveBeenCalledWith('Choose at least one credential.');
      expect(page().querySelector('#credential-search')).not.toBeNull();
      expect(document.activeElement?.id).toBe('credential-search');
    });

    it('says why Next cannot be used when no credential fits the flow', async () => {
      configs = [ageCheck];
      await render();
      await next();

      expect(text()).toContain('No credential configuration fits this flow.');
      expect(button('Next')!.getAttribute('aria-disabled')).toBe('true');
      expect(text()).toContain('Choose the built-in (IAE) flow instead.');
    });
  });

  describe('authorization servers and attribute providers', () => {
    it('starts with the first server, and the external flow needs one of several, not the built-in', async () => {
      await render();
      await next();
      await choose('student-id');
      await next();
      expect(field<HTMLSelectElement>('Authorization server').value).toBe('built-in');

      button('Reset')!.click();
      await settle();
      await chooseFlow('authorization_code_external');
      await next();
      await choose('student-id');
      await next();

      const select = field<HTMLSelectElement>('Authorization server');
      expect([...select.options].map((option) => option.value)).toEqual(['', 'keycloak', 'bank']);
      expect(select.value).toBe('keycloak');
      expect(text()).toContain('The server signs the holder in.');
    });

    it('takes the only server there is, and the only attribute provider', async () => {
      servers = [servers[0], servers[1]];
      await render();
      await chooseFlow('authorization_code_external');
      await next();
      await choose('student-id');
      await next();

      expect(field<HTMLSelectElement>('Authorization server').value).toBe('keycloak');
      expect(field<HTMLSelectElement>('student-id').value).toBe('campus');
    });

    it('leaves the attribute provider to choose among several', async () => {
      providers = [
        { id: 'campus', name: 'Campus directory' },
        { id: 'hr', name: 'HR system' },
      ];
      await render();
      await chooseFlow('authorization_code_external');
      await next();
      await choose('student-id');
      await next();

      expect(field<HTMLSelectElement>('student-id').value).toBe('');
      button(/Create offer/)!.click();
      await settle(() =>
        expect(text()).toContain('Choose the attribute provider that resolves the claims.')
      );
      expect(posted).toHaveLength(0);
    });

    it('says why the offer cannot be created without an attribute provider', async () => {
      providers = [];
      await render();
      await chooseFlow('authorization_code_external');
      await next();
      await choose('student-id');
      await next();

      expect(text()).toContain('No attribute provider is configured.');
      expect(button(/Create offer/)!.getAttribute('aria-disabled')).toBe('true');
    });

    it('says that the attribute providers could not be loaded instead of that none exists', async () => {
      providers = 'fail';
      await render();
      await chooseFlow('authorization_code_external');
      await next();
      await choose('student-id');
      await next();

      expect(text()).toContain('The attribute providers could not be loaded.');
    });

    it('needs no attribute provider for a credential that names its own', async () => {
      providers = [];
      configs = [{ ...studentId, attributeProviderId: 'campus' }];
      await render();
      await chooseFlow('authorization_code_external');
      await next();
      await choose('student-id');
      await next();

      expect(button(/Create offer/)!.getAttribute('aria-disabled')).toBeNull();
    });

    it('says when no server is configured for the external flow', async () => {
      servers = [servers[0]];
      await render();
      await chooseFlow('authorization_code_external');
      await next();
      await choose('student-id');
      await next();

      expect(text()).toContain('No authorization server is configured for this flow.');
      expect(button(/Create offer/)!.getAttribute('aria-disabled')).toBe('true');
    });
  });

  describe('claims', () => {
    async function openClaims(...ids: string[]) {
      await render();
      await next();
      await choose(...ids);
      await next();
    }

    it('labels a claim with its display name, else with its name', async () => {
      await openClaims('student-id');

      expect(field('Given name')).toBeInstanceOf(HTMLInputElement);
      expect(field('student_number').type).toBe('number');
    });

    it('focuses a missing claim and names its credential', async () => {
      await openClaims('student-id');

      button(/Create offer/)!.click();
      await settle(() => expect(text()).toContain('Enter Given name.'));

      expect(notify.error).toHaveBeenCalledWith('Check the highlighted fields in student-id.');
      await vi.waitFor(() => expect(document.activeElement).toBe(field('Given name')));
      expect(posted).toHaveLength(0);
    });

    it('fills in the default values of the credential', async () => {
      await openClaims('student-id');

      button('Fill in the default values')!.click();
      await settle(() => expect(field('Given name').value).toBe('Erika'));
    });

    it('sends the offer with the claims, the mdoc ones in their namespace, and shows it', async () => {
      await openClaims('student-id', 'mdl');
      type(field('Given name'), 'Erika');
      type(field('student_number'), '4711');
      type(field('family_name'), 'Doe');
      type(field('Transaction code'), '1234');
      await settle();

      button(/Create offer/)!.click();
      await settle(() => expect(posted).toHaveLength(1));

      expect(posted[0]).toEqual({
        flow: 'pre_authorized_code',
        response_type: 'uri',
        credentialConfigurationIds: ['student-id', 'mdl'],
        credentialClaims: {
          'student-id': { type: 'inline', claims: { given_name: 'Erika', student_number: 4711 } },
          mdl: { type: 'inline', claims: { 'org.iso.18013.5.1': { family_name: 'Doe' } } },
        },
        tx_code: '1234',
        authorization_server: 'built-in',
      });
      await settle(() => expect(text()).toContain('Waiting for the wallet'));
      expect(text()).toContain('openid-credential-offer://?credential_offer_uri=x');
      expect(text()).toContain('1234');
      expect(notify.success).toHaveBeenCalledWith('Offer created.');
    });

    it('creates one offer for two clicks while it is created', async () => {
      await openClaims('student-id');
      type(field('Given name'), 'Erika');
      type(field('student_number'), '1');
      await settle();
      holdOffer = true;

      button(/Create offer/)!.click();
      // The running request is pending work, so the fixture is not stable until it ends.
      await vi.waitFor(() => {
        fixture.detectChanges();
        expect(button(/Creating the offer/)).toBeDefined();
      });
      button(/Creating the offer/)!.click();
      fixture.detectChanges();
      await vi.waitFor(() => expect(posted).toHaveLength(1));
      expect(posted).toHaveLength(1);

      release?.();
      await settle(() => expect(text()).toContain('Waiting for the wallet'));
      expect(posted).toHaveLength(1);
    });

    it('renders no HTML that claim constraints carry', async () => {
      configs = [
        {
          ...studentId,
          fields: [
            {
              path: ['nickname'],
              type: 'string',
              constraints: {
                description: '<img id="from-description" src="x">',
                widget: {
                  formlyConfig: { type: 'formly-template', template: '<b id="injected">x</b>' },
                },
              },
            },
          ],
        },
        // A second credential, so the first is not chosen on its own.
        mdl,
      ];
      await openClaims('student-id');

      expect(field('nickname')).toBeInstanceOf(HTMLInputElement);
      expect(page().querySelector('#injected')).toBeNull();
      expect(page().querySelector('#from-description')).toBeNull();
      expect(text()).toContain('<img id="from-description" src="x">');
    });

    it('gives formly the same fields on every check', async () => {
      await openClaims('student-id');
      const form = () => fixture.debugElement.query(By.directive(FormlyForm)).componentInstance;
      const fields = form().fields;

      type(field('Given name'), 'Erika');
      await settle();
      fixture.detectChanges();

      expect(form().fields).toBe(fields);
    });
  });

  it('fills the steps in from an earlier offer and opens the last one', async () => {
    history.replaceState(
      {
        offerRequest: {
          flow: 'pre_authorized_code',
          response_type: 'uri',
          credentialConfigurationIds: ['mdl'],
          credentialClaims: {
            mdl: { type: 'inline', claims: { 'org.iso.18013.5.1': { family_name: 'Doe' } } },
          },
          tx_code: '9876',
        },
      },
      ''
    );
    await render();

    await settle(() => expect(field('family_name').value).toBe('Doe'));
    expect(field('Transaction code').value).toBe('9876');
    expect(page().querySelector('[aria-current="step"]')?.textContent).toContain('Claims');
    expect(notify.info).toHaveBeenCalledWith('Filled in from the earlier offer.');
  });
});
