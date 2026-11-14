import type { IssuanceConfig } from '@eudiplo/sdk-core';
import { describe, expect, it } from 'vitest';
import {
  authorizationServers,
  generatesCertificate,
  registrationJwt,
  registrationStatus,
  renewalLabel,
  statusCheckModeLabel,
} from './issuer-settings';

const configWith = (extra: Record<string, unknown>) =>
  ({ authorizationServers: [], display: [], ...extra }) as unknown as IssuanceConfig;

describe('authorizationServers', () => {
  it('shows the token lifetime that applies, the default one per type when none is set', () => {
    const servers = authorizationServers(
      configWith({
        authorizationServers: [
          { type: 'built-in', id: 'issuer-built-in' },
          { type: 'chained', id: 'chained', upstream: {} },
          {
            type: 'oid4vp',
            id: 'vp',
            presentationConfigId: 'pid',
            token: { lifetimeSeconds: 900 },
          },
        ],
      })
    );

    expect(servers.map((server) => server.policy?.tokenLifetime)).toEqual([
      '5 minutes',
      '1 hour',
      '15 minutes',
    ]);
    expect(servers.map((server) => server.policy?.tokenLifetimeIsDefault)).toEqual([
      true,
      true,
      false,
    ]);
  });

  it("shows each server's status check mode, else the issuer's that it inherits", () => {
    const servers = authorizationServers(
      configWith({
        walletAttestationStatusCheckMode: 'strict',
        authorizationServers: [
          { type: 'built-in', id: 'issuer-built-in' },
          {
            type: 'chained',
            id: 'chained',
            upstream: {},
            walletAttestationStatusCheckMode: 'disabled',
          },
          { type: 'external', id: 'ext', issuer: 'https://as.example' },
        ],
      })
    );

    expect(servers.map((server) => server.policy?.statusCheck)).toEqual([
      'Strict',
      'Disabled',
      undefined,
    ]);
    expect(servers[0].policy?.statusCheckInherited).toBe(true);
    expect(servers[1].policy?.statusCheckInherited).toBe(false);
  });

  it('prefers the first enabled server and leaves out an external one without an issuer', () => {
    const servers = authorizationServers(
      configWith({
        authorizationServers: [
          { type: 'built-in', id: 'off', enabled: false },
          { type: 'external', id: 'empty', issuer: '' },
          { type: 'external', id: 'ext', issuer: 'https://as.example', label: 'Acme login' },
          { type: 'built-in', id: 'second' },
        ],
      })
    );

    expect(servers.map((server) => [server.id, server.name, server.preferred])).toEqual([
      ['off', 'off', false],
      ['ext', 'Acme login', true],
      ['second', 'second', false],
    ]);
    expect(servers[1].policy).toBeUndefined();
    expect(servers[1].details).toEqual([{ label: 'Issuer', value: 'https://as.example' }]);
  });

  it('names what each server depends on, and when refresh tokens end', () => {
    const [chained, vp] = authorizationServers(
      configWith({
        authorizationServers: [
          {
            type: 'chained',
            id: 'keycloak',
            upstream: {
              issuer: 'https://idp.example',
              clientId: 'eudiplo',
              scopes: ['openid', 'email'],
            },
            token: { refreshTokenEnabled: false },
            requireDPoP: true,
          },
          { type: 'oid4vp', id: 'vp', presentationConfigId: 'pid' },
        ],
      })
    );

    expect(chained.details).toEqual([
      { label: 'Upstream issuer', value: 'https://idp.example' },
      { label: 'Client ID', value: 'eudiplo' },
      { label: 'Scopes', value: 'openid email' },
    ]);
    expect(chained.policy).toMatchObject({ dpop: 'Required', refresh: 'Off' });
    expect(vp.details).toEqual([{ label: 'Presentation', value: 'pid' }]);
    expect(vp.policy).toMatchObject({ dpop: 'Optional', refresh: '30 days' });
  });
});

describe('registration certificate', () => {
  const now = 1_800_000_000;
  const withCertificate = (enabled: boolean, expiresAt?: number) =>
    configWith({
      registrationCertificate: { enabled },
      registrationCertificateCache: expiresAt === undefined ? null : { jwt: 'cached', expiresAt },
    });

  it('is off, pending, active, expiring in its last week, or expired', () => {
    expect(registrationStatus(withCertificate(false), now)).toBe('off');
    expect(registrationStatus(withCertificate(true), now)).toBe('pending');
    expect(registrationStatus(withCertificate(true, now + 30 * 86_400), now)).toBe('active');
    expect(registrationStatus(withCertificate(true, now + 6 * 86_400), now)).toBe('expiring');
    expect(registrationStatus(withCertificate(true, now - 1), now)).toBe('expired');
  });

  it('is generated unless it is imported', () => {
    expect(generatesCertificate(configWith({ registrationCertificate: { enabled: true } }))).toBe(
      true
    );
    expect(
      generatesCertificate(
        configWith({ registrationCertificate: { enabled: true, mode: 'import' } })
      )
    ).toBe(false);
  });

  it('shows the generated certificate, else the imported one', () => {
    expect(
      registrationJwt(
        configWith({
          registrationCertificate: { jwt: 'imported' },
          registrationCertificateCache: { jwt: 'generated' },
        })
      )
    ).toBe('generated');
    expect(registrationJwt(configWith({ registrationCertificate: { jwt: 'imported' } }))).toBe(
      'imported'
    );
    expect(registrationJwt(configWith({}))).toBeUndefined();
  });

  it('says when a generated certificate is renewed', () => {
    expect(renewalLabel(undefined)).toBe('When credential types or issuer settings change');
    expect(renewalLabel('onMetadataRequest')).toBe('On the next metadata request');
    expect(renewalLabel('manual')).toBe('Only with Regenerate now');
  });
});

describe('statusCheckModeLabel', () => {
  it('is best effort unless strict or disabled', () => {
    expect(statusCheckModeLabel(undefined)).toBe('Best effort');
    expect(statusCheckModeLabel(null)).toBe('Best effort');
    expect(statusCheckModeLabel('best_effort')).toBe('Best effort');
    expect(statusCheckModeLabel('strict')).toBe('Strict');
    expect(statusCheckModeLabel('disabled')).toBe('Disabled');
  });
});
