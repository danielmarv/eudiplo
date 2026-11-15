import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { client } from '@eudiplo/sdk-core';
import { provideTanStackQuery, QueryClient } from '@tanstack/angular-query-experimental';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type Caller, CallerService } from '../../../core/auth/caller.service';
import { SessionService } from '../../../core/auth/session.service';
import { NotifyService } from '../../../core/notify/notify.service';
import { sessionResult } from '../../../shared/sessions/session-outcome';
import { groupCredentialStatus } from '../data/credential-status';
import { SessionDetail } from './session-detail';

const base = {
  id: 's1',
  createdAt: '2026-11-14T10:00:00Z',
  updatedAt: '2026-11-14T10:05:00Z',
  useDcApi: false,
  tenantId: 'acme',
  notifications: [],
  txCodeFailedAttempts: 0,
  consumed: false,
};

describe('session outcome', () => {
  it('explains how a session ended', () => {
    expect(sessionResult({ ...base, status: 'active' } as never)).toBeNull();
    expect(sessionResult({ ...base, status: 'completed', requestId: 'age' } as never)?.title).toBe(
      'Presentation verified'
    );
    expect(sessionResult({ ...base, status: 'expired', consumed: true } as never)?.title).toBe(
      'Credentials issued, not confirmed'
    );
    expect(
      sessionResult({
        ...base,
        status: 'failed',
        requestId: 'age',
        failureCode: 'access_denied',
        outcome: { source: 'wallet', error: 'access_denied' },
      } as never)
    ).toMatchObject({ title: 'The user declined the request in the wallet', checkRequest: false });
    expect(
      sessionResult({ ...base, status: 'cancelled', cancelReason: 'Wrong person' } as never)
    ).toMatchObject({ title: 'Session cancelled', cancelReason: 'Wrong person' });
  });

  it('offers only the status changes the lists allow', () => {
    const [pid, card] = groupCredentialStatus([
      { credentialConfigurationId: 'pid', statusListId: 'l1', index: 1, status: 0, bits: 2 },
      { credentialConfigurationId: 'pid', statusListId: 'l1', index: 2, status: 2, bits: 2 },
      { credentialConfigurationId: 'card', statusListId: 'l2', index: 1, status: 1, bits: 1 },
    ]);
    expect(pid).toMatchObject({ canRevoke: true, canSuspend: true, canReinstate: true });
    expect(card).toMatchObject({ canRevoke: false, canSuspend: false, canReinstate: false });
  });
});

describe('session detail page', () => {
  let session: Record<string, unknown>;
  let requests: { method: string; path: string; body?: unknown }[];
  let notify: Record<'success' | 'info' | 'warning' | 'error', ReturnType<typeof vi.fn>>;
  const caller = signal<Caller | undefined>(undefined);
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
    const fixture = TestBed.createComponent(SessionDetail);
    fixture.componentRef.setInput('id', 's1');
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
    session = {
      ...base,
      status: 'completed',
      credentialConfigurationIds: ['pid'],
      credentialPayload: { credentialConfigurationIds: ['pid'] },
      reference: 'order-42',
    };
    requests = [];
    notify = { success: vi.fn(), info: vi.fn(), warning: vi.fn(), error: vi.fn() };
    caller.set({
      subject: 'acme-admin',
      tenantId: 'acme',
      roles: ['issuance:offer', 'issuance:manage'],
    });
    client.setConfig({
      baseUrl: 'http://backend.test',
      fetch: async (request: RequestInfo | URL) => {
        const call = request instanceof Request ? request : new Request(String(request));
        const path = new URL(call.url).pathname;
        const raw = call.method === 'POST' ? await call.clone().text() : '';
        requests.push({ method: call.method, path, body: raw ? JSON.parse(raw) : undefined });
        if (path === '/api/session/s1') return json(session);
        if (path === '/api/session/s1/logs') {
          return json([
            {
              id: 'l1',
              sessionId: 's1',
              timestamp: '2026-11-14T10:01:00Z',
              level: 'info',
              stage: 'issue',
              message: 'Credential issued',
            },
          ]);
        }
        if (path === '/api/session/s1/credential-status') {
          return json([
            { credentialConfigurationId: 'pid', statusListId: 'l1', index: 4, status: 0, bits: 2 },
          ]);
        }
        if (path === '/api/session/s1/cancel') return json(undefined, 201);
        if (path === '/api/session/revoke') return json(undefined, 201);
        if (path === '/api/frontend-config')
          return json({ grafana: { tempoUid: 't', lokiUid: 'l' } });
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

  it('shows how an issuance ended, its credential status and its log', async () => {
    const { settle } = await render();
    await settle(() => expect(text()).toContain('Credentials issued'));
    expect(text()).toContain('Reference order-42');
    await settle(() => expect(text()).toContain('1 valid'));
    expect(text()).toContain('Log (1)');
  });

  it('revokes the credentials of a type after asking', async () => {
    const { settle } = await render();
    await settle(() => expect(button('Revoke')).toBeDefined());
    button('Revoke')!.click();
    await settle(() => expect(text()).toContain('Revocation is final'));
    [...page().querySelectorAll<HTMLButtonElement>('button')]
      .filter((candidate) => candidate.textContent?.trim() === 'Revoke')
      .at(-1)!
      .click();
    await settle(() => expect(notify.success).toHaveBeenCalledWith('Credentials revoked.'));
    expect(requests).toContainEqual({
      method: 'POST',
      path: '/api/session/revoke',
      body: { sessionId: 's1', status: 1, credentialConfigurationId: 'pid' },
    });
  });

  it('cancels a pending offer with a reason and recreates one with the same request', async () => {
    session = { ...session, status: 'active', offerUrl: 'openid-credential-offer://?x=1' };
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    const { settle } = await render();
    await settle(() => expect(button('Cancel offer')).toBeDefined());
    expect(text()).toContain('openid-credential-offer://?x=1');

    button('Cancel offer')!.click();
    await settle(() => expect(page().querySelector('#detail-cancel-reason')).not.toBeNull());
    const reason = page().querySelector<HTMLTextAreaElement>('#detail-cancel-reason')!;
    reason.value = 'Wrong person';
    reason.dispatchEvent(new Event('input'));
    [...page().querySelectorAll<HTMLButtonElement>('button')]
      .filter((candidate) => candidate.textContent?.trim() === 'Cancel offer')
      .at(-1)!
      .click();
    await settle(() => expect(notify.success).toHaveBeenCalledWith('Offer cancelled.'));
    expect(requests).toContainEqual({
      method: 'POST',
      path: '/api/session/s1/cancel',
      body: { reason: 'Wrong person' },
    });

    button('Offer again')!.click();
    expect(navigate).toHaveBeenCalledWith(['/offer/issuance'], {
      state: { offerRequest: { credentialConfigurationIds: ['pid'] } },
    });
  });

  it('hides the offer link from a caller who only reads sessions', async () => {
    session = { ...session, status: 'active', offerUrl: 'openid-credential-offer://?x=1' };
    caller.set({ subject: 'auditor', tenantId: 'acme', roles: ['sessions:read'] });
    const { settle } = await render();
    await settle(() => expect(text()).toContain('are shown only with'));
    // The backend leaves the link out for such a caller; the page shows no QR code either way.
    expect(page().querySelector('img[alt="QR code of the offer"]')).toBeNull();
    expect(page().querySelector('a[href="openid-credential-offer://?x=1"]')).toBeNull();
    expect(button('Cancel offer')).toBeUndefined();
  });
});
