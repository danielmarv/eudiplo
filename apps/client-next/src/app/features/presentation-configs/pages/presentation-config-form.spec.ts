import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { client, type PresentationConfig } from '@eudiplo/sdk-core';
import { provideTanStackQuery, QueryClient } from '@tanstack/angular-query-experimental';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type Caller, CallerService } from '../../../core/auth/caller.service';
import { SessionService } from '../../../core/auth/session.service';
import { NotifyService } from '../../../core/notify/notify.service';
import { PresentationConfigForm } from './presentation-config-form';

describe('presentation configuration form page', () => {
  const caller = signal<Caller | undefined>({
    subject: 'acme-admin',
    tenantId: 'acme',
    roles: ['presentation:manage'],
  });
  let source: 'loading' | 'success' | 'failure' | 'not-found';
  let releaseSource: (response: Response) => void;

  const json = (body: unknown, status = 200) =>
    new Response(body === undefined ? null : JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });

  const config: PresentationConfig = {
    id: 'age-check',
    description: 'Verify age',
    lifeTime: 300,
    statusCheckMode: 'strict',
    dcql_query: {
      credentials: [
        {
          id: 'pid',
          format: 'dc+sd-jwt',
          meta: { vct_values: ['urn:example:pid'] },
        },
      ],
    },
  } as PresentationConfig;

  beforeEach(() => {
    source = 'loading';
    client.setConfig({
      baseUrl: 'http://backend.test',
      fetch: async (requestInfo: RequestInfo | URL) => {
        const request =
          requestInfo instanceof Request ? requestInfo : new Request(String(requestInfo));
        const path = new URL(request.url).pathname;
        if (path === '/api/verifier/config/age-check') {
          if (source === 'loading') {
            return await new Promise<Response>((resolve) => {
              releaseSource = resolve;
            });
          }
          if (source === 'failure') {
            return json({ statusCode: 503, message: 'Service unavailable' }, 503);
          }
          if (source === 'not-found') {
            return json({ statusCode: 404, message: 'Presentation configuration not found' }, 404);
          }
          return json(config);
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
        {
          provide: NotifyService,
          useValue: { success: vi.fn(), info: vi.fn(), warning: vi.fn(), error: vi.fn() },
        },
      ],
    });
  });

  afterEach(() => {
    client.setConfig({ fetch: () => new Promise<Response>(() => undefined) });
    document.body.innerHTML = '';
  });

  function render() {
    const fixture = TestBed.createComponent(PresentationConfigForm);
    fixture.componentRef.setInput('id', 'age-check');
    fixture.componentRef.setInput('copy', true);
    document.body.appendChild(fixture.nativeElement);
    fixture.detectChanges();
    return fixture;
  }

  it('waits for the source before showing a populated copy form', async () => {
    const fixture = render();

    expect(
      document.querySelector('[role="status"][aria-label="Loading presentation configuration"]')
    ).not.toBeNull();
    expect(document.querySelector('form')).toBeNull();
    await vi.waitFor(() => expect(releaseSource).toBeTypeOf('function'));
    source = 'success';
    releaseSource(json(config));

    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(document.querySelector<HTMLInputElement>('input[formControlName="id"]')?.value).toBe(
        'age-check-copy'
      );
    });
    expect(
      document.querySelector<HTMLInputElement>('input[formControlName="description"]')?.value
    ).toBe('Verify age');
    expect(document.body.textContent).toContain('urn:example:pid');
  });

  it('keeps the form unavailable and offers retry when the source fails to load', async () => {
    source = 'failure';
    const fixture = render();

    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(document.body.textContent).toContain('could not be loaded');
    });
    expect(document.querySelector('form')).toBeNull();
    expect(
      [...document.querySelectorAll('button')].some((button) =>
        button.textContent?.includes('Retry')
      )
    ).toBe(true);

    source = 'success';
    [...document.querySelectorAll('button')]
      .find((button) => button.textContent?.includes('Retry'))
      ?.click();
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(document.querySelector<HTMLInputElement>('input[formControlName="id"]')?.value).toBe(
        'age-check-copy'
      );
    });
  });

  it('shows a not-found state without retry when the source does not exist', async () => {
    source = 'not-found';
    const fixture = render();

    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(document.body.textContent).toContain(
        'There is no presentation configuration age-check'
      );
    });
    expect(document.querySelector('form')).toBeNull();
    expect(document.body.textContent).not.toMatch(/retry/i);
    expect(
      [...document.querySelectorAll<HTMLElement>('[aria-label], [title]')].some((element) =>
        /retry/i.test(`${element.getAttribute('aria-label')} ${element.title}`)
      )
    ).toBe(false);
  });
});
