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
import { UserDetail } from './user-detail';
import { UserForm } from './user-form';
import { UserList } from './user-list';

describe('user pages', () => {
  let users: Record<string, unknown>[] | 'unavailable';
  let requests: { method: string; path: string; body?: unknown }[];
  let notify: Record<'success' | 'info' | 'warning' | 'error', ReturnType<typeof vi.fn>>;
  const caller = signal<Caller | undefined>(undefined);

  const json = (body: unknown, status = 200) =>
    new Response(body === undefined ? null : JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });
  const page = () => document.body;
  const text = () => page().textContent?.replace(/\s+/g, ' ') ?? '';
  const rows = () => [...page().querySelectorAll('tbody tr')];
  const button = (name: string) =>
    [...page().querySelectorAll<HTMLButtonElement>('button')].find(
      (candidate) => candidate.textContent?.replace(/\s+/g, ' ').trim() === name
    );
  const labelled = (label: string) =>
    page().querySelector<HTMLButtonElement>(`[aria-label="${label}"]`)!;

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
    return { settle };
  }

  beforeEach(() => {
    users = [
      {
        id: 'u1',
        username: 'ada',
        email: 'ada@acme.example',
        enabled: true,
        roles: ['issuance:offer'],
      },
      { id: 'u2', username: 'root', enabled: false, roles: ['tenant:admin'] },
    ];
    requests = [];
    notify = { success: vi.fn(), info: vi.fn(), warning: vi.fn(), error: vi.fn() };
    caller.set({
      subject: 'admin',
      tenantId: 'acme',
      roles: ['users:manage', 'issuance:offer', 'issuance:manage'],
    });
    client.setConfig({
      baseUrl: 'http://backend.test',
      fetch: async (request: RequestInfo | URL) => {
        const call = request instanceof Request ? request : new Request(String(request));
        const path = new URL(call.url).pathname;
        const raw = ['POST', 'PATCH'].includes(call.method) ? await call.clone().text() : '';
        const body = raw ? JSON.parse(raw) : undefined;
        requests.push({ method: call.method, path, body });
        if (path === '/api/user') {
          if (users === 'unavailable') {
            return json({ statusCode: 501, message: 'Keycloak manages no people here.' }, 501);
          }
          if (call.method === 'POST') {
            return json(
              { id: 'u3', ...(body as object), temporaryPassword: 'example-password' },
              201
            );
          }
          return json(users);
        }
        const one = /^\/api\/user\/([^/]+)$/.exec(path)?.[1];
        if (one) {
          const found = (users === 'unavailable' ? [] : users).find((user) => user['id'] === one);
          if (!found) return json({ statusCode: 404, message: 'Not found' }, 404);
          if (call.method === 'DELETE') return json(undefined, 204);
          if (call.method === 'PATCH') return json({ ...found, ...(body as object) });
          return json(found);
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

  it('lists the people with their status and locks those the caller may not change', async () => {
    const { settle } = await render(UserList);
    await settle(() => expect(rows()).toHaveLength(2));
    expect(rows()[0].textContent).toContain('Enabled');
    expect(rows()[1].textContent).toContain('Disabled');
    expectUnavailable(
      labelled('Delete root'),
      'This person has roles you neither hold nor may grant.'
    );
  });

  it('says when the identity provider manages no people', async () => {
    users = 'unavailable';
    const { settle } = await render(UserList);
    await settle(() => expect(text()).toContain('User management is unavailable'));
    expect(text()).toContain('Keycloak manages no people here.');
  });

  it('deletes a person after asking', async () => {
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    const { settle } = await render(UserDetail, { id: 'u1' });
    await settle(() => expect(text()).toContain('ada@acme.example'));
    button('Delete')!.click();
    await settle(() => expect(button('Delete person')).toBeDefined());
    button('Delete person')!.click();
    await settle(() => expect(navigate).toHaveBeenCalledWith(['/users']));
    expect(requests).toContainEqual(
      expect.objectContaining({ method: 'DELETE', path: '/api/user/u1' })
    );
  });

  it('adds a person and shows the temporary password once', async () => {
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    const { settle } = await render(UserForm);
    const input = page().querySelector<HTMLInputElement>('#user-name')!;
    input.value = 'grace';
    input.dispatchEvent(new Event('input'));
    page().querySelector<HTMLButtonElement>('#role-issuance\\:offer')!.click();
    await settle(() =>
      expect(page().querySelector('#role-issuance\\:offer')!.getAttribute('aria-checked')).toBe(
        'true'
      )
    );
    button('Add person')!.click();
    await settle(() => expect(text()).toContain('example-password'));
    expect(requests).toContainEqual({
      method: 'POST',
      path: '/api/user',
      body: { username: 'grace', enabled: true, roles: ['issuance:offer'] },
    });
    button('I saved the password')!.click();
    await settle(() => expect(navigate).toHaveBeenCalledWith(['/users', 'u3']));
  });

  it('cannot change a person with roles the caller may not grant', async () => {
    const { settle } = await render(UserForm, { id: 'u2' });
    await settle(() => expect(text()).toContain('You cannot change this person'));
    expectUnavailable(
      button('Save person')!,
      'You cannot change this person: they have roles you neither hold nor may grant.'
    );
  });
});
