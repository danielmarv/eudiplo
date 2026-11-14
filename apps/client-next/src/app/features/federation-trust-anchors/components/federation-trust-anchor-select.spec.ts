import { Component, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { client } from '@eudiplo/sdk-core';
import { provideTanStackQuery, QueryClient } from '@tanstack/angular-query-experimental';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type Caller, CallerService } from '../../../core/auth/caller.service';
import { SessionService } from '../../../core/auth/session.service';
import { FederationTrustAnchorSelect } from './federation-trust-anchor-select';

@Component({
  standalone: true,
  imports: [ReactiveFormsModule, FederationTrustAnchorSelect],
  template: `
    <form [formGroup]="form">
      <app-federation-trust-anchor-select formControlName="entityId" />
    </form>
  `,
})
class SelectHost {
  readonly form = new FormGroup({
    entityId: new FormControl('https://old-anchor.example', { nonNullable: true }),
  });
}

describe('federation trust anchor selector', () => {
  const caller = signal<Caller | undefined>({
    subject: 'acme-admin',
    tenantId: 'acme',
    roles: ['presentation:manage'],
  });

  beforeEach(() => {
    client.setConfig({
      baseUrl: 'http://backend.test',
      fetch: async () =>
        new Response(
          JSON.stringify([
            {
              id: 'eu-federation',
              tenantId: 'acme',
              entityId: 'https://anchor.example',
              description: 'EU federation',
              jwks: { keys: [] },
            },
          ]),
          { headers: { 'Content-Type': 'application/json' } }
        ),
    });
    TestBed.configureTestingModule({
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
  });

  it('keeps an unregistered saved value visible and offers registration with that value', async () => {
    const fixture = TestBed.createComponent(SelectHost);
    fixture.detectChanges();

    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(document.querySelector('option[value="https://anchor.example"]')).not.toBeNull();
      expect(document.body.textContent).toContain('is not registered');
    });
    const select = document.querySelector<HTMLSelectElement>('select')!;
    expect(select.value).toBe('https://old-anchor.example');
    expect(
      document.querySelector('option[value="https://old-anchor.example"]')?.textContent
    ).toContain('not registered');
    const registrationLink = document.querySelector<HTMLAnchorElement>('a[target="_blank"]')!;
    expect(registrationLink.href).toContain('entityId=');
    expect(registrationLink.href).toContain('old-anchor.example');

    select.value = 'https://anchor.example';
    select.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    expect(fixture.componentInstance.form.controls.entityId.value).toBe('https://anchor.example');
  });

  it('hides registration actions when the configuration control is disabled', async () => {
    const fixture = TestBed.createComponent(SelectHost);
    fixture.detectChanges();
    fixture.componentInstance.form.controls.entityId.disable();

    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(document.querySelector<HTMLSelectElement>('select')?.disabled).toBe(true);
      expect(document.querySelector('a[target="_blank"]')).toBeNull();
    });
  });
});
