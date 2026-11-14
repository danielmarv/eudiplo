import type { RegistrarConfigResponseDto } from '@eudiplo/sdk-core';
import { describe, expect, it } from 'vitest';
import {
  createRegistrarForm,
  fillRegistrarForm,
  registrarRequest,
  urlsChanged,
} from './registrar-form';

const stored: RegistrarConfigResponseDto = {
  registrarUrl: 'https://registrar.example/api',
  oidcUrl: 'https://auth.example/realms/registrar',
  clientId: 'eudiplo',
  username: 'acme',
  hasPassword: true,
  hasClientSecret: true,
  registrationCertificateDefaults: {
    privacy_policy: 'https://acme.example/privacy',
    provides_attestations: ['pid'],
  } as never,
  relyingPartyContact: { email: 'support@acme.example' },
};

describe('registrar form', () => {
  it('asks for base URLs, the account and a password for a new configuration', () => {
    const form = createRegistrarForm();
    fillRegistrarForm(form, null);
    form.patchValue({ registrarUrl: 'https://r.example/api?x=1', oidcUrl: 'ftp://auth.example' });

    expect(form.controls.registrarUrl.hasError('baseUrl')).toBe(true);
    expect(form.controls.oidcUrl.hasError('url')).toBe(true);
    expect(form.controls.password.hasError('required')).toBe(true);
    expect(form.controls.username.hasError('required')).toBe(true);
  });

  it('checks the contact like the registrar: https support URL, email and phone', () => {
    const form = createRegistrarForm();
    form.patchValue({ supportUri: 'http://acme.example', email: 'nope', phone: '12' });

    expect(form.controls.supportUri.hasError('pattern')).toBe(true);
    expect(form.controls.email.hasError('pattern')).toBe(true);
    expect(form.controls.phone.hasError('pattern')).toBe(true);
  });

  it('changes a stored configuration with only what changed, keeping the stored secrets', () => {
    const form = createRegistrarForm();
    fillRegistrarForm(form, stored);
    form.patchValue({ username: 'acme-ops', privacy_policy: '', phone: '+49 30 1234567' });

    expect(form.valid).toBe(true);
    expect(registrarRequest(form)).toEqual({
      method: 'PATCH',
      body: {
        username: 'acme-ops',
        registrationCertificateDefaults: { provides_attestations: ['pid'] },
        relyingPartyContact: { email: 'support@acme.example', phone: '+49 30 1234567' },
      },
    });
  });

  it('replaces the configuration for new URLs, which needs the password again', () => {
    const form = createRegistrarForm();
    fillRegistrarForm(form, stored);
    form.controls.oidcUrl.setValue('https://auth.other.example/realms/registrar');

    expect(urlsChanged(form)).toBe(true);
    expect(form.controls.password.hasError('required')).toBe(true);
    form.controls.password.setValue('secret');
    const request = registrarRequest(form);
    expect(request.method).toBe('POST');
    expect(request.body).toMatchObject({
      registrarUrl: 'https://registrar.example/api',
      oidcUrl: 'https://auth.other.example/realms/registrar',
      clientId: 'eudiplo',
      username: 'acme',
      password: 'secret',
    });
    expect(request.body).not.toHaveProperty('clientSecret');
  });
});
