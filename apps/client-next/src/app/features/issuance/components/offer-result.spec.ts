import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { type Caller } from '../../../core/auth/caller.service';
import { CallerService } from '../../../core/auth/caller.service';
import { SessionService } from '../../../core/auth/session.service';
import { NotifyService } from '../../../core/notify/notify.service';
import { provideTanStackQuery, QueryClient } from '@tanstack/angular-query-experimental';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { OfferResult } from './offer-result';

describe('OfferResult', () => {
  afterEach(() => {
    TestBed.inject(QueryClient).clear();
    document.body.innerHTML = '';
  });

  it('links the created session to the session list search', async () => {
    const caller = signal<Caller | undefined>(undefined);
    TestBed.configureTestingModule({
      imports: [OfferResult],
      providers: [
        provideRouter([]),
        provideTanStackQuery(new QueryClient({ defaultOptions: { queries: { retry: false } } })),
        { provide: SessionService, useValue: { getBaseUrl: () => 'http://backend.test' } },
        { provide: CallerService, useValue: { loadedCaller: caller } },
        {
          provide: NotifyService,
          useValue: { success: vi.fn(), info: vi.fn(), warning: vi.fn(), error: vi.fn() },
        },
      ],
    });

    const fixture = TestBed.createComponent(OfferResult);
    fixture.componentRef.setInput('offer', {
      uri: 'openid-credential-offer://example',
      session: 'session-123',
    });
    document.body.appendChild(fixture.nativeElement);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const link = (fixture.nativeElement as HTMLElement).querySelector<HTMLAnchorElement>(
      'a[href^="/session-management?"]'
    );
    expect(link).not.toBeNull();
    expect(new URL(link!.href).searchParams.get('q')).toBe('session-123');
  });
});
