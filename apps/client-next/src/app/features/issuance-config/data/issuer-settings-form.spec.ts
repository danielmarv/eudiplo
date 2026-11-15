import { describe, expect, it } from 'vitest';
import {
  pemToBase64Der,
  TEST_ROOT_CERTIFICATE_PEM,
} from '../../../shared/certificates/certificate-validator.testing';
import {
  createIssuerSettingsForm,
  createServerGroup,
  fillIssuerSettingsForm,
  issuerSettingsBody,
  serverProblems,
} from './issuer-settings-form';

const stored = {
  display: [{ name: 'Acme', locale: 'en-US', logo: { uri: 'https://acme.example/logo.png' } }],
  batchSize: 2,
  dPopRequired: true,
  walletAttestationRequired: true,
  walletAttestationStatusCheckMode: 'strict',
  txCodeMaxAttempts: 3,
  walletProviderTrustLists: [
    { trustListId: 'wallets' },
    { url: 'https://lists.example/old', verifierKey: { kty: 'EC' } },
  ],
  authorizationServers: [
    {
      id: 'issuer-built-in',
      type: 'built-in',
      label: 'Built-in',
      enabled: true,
      token: { lifetimeSeconds: 300 },
    },
    {
      id: 'login',
      type: 'chained',
      label: 'Company login',
      enabled: true,
      walletAttestationRequired: false,
      walletProviderTrustLists: [{ trustListId: 'wallets' }],
      upstream: {
        issuer: 'https://idp.example',
        clientId: 'eudiplo',
        clientSecret: '<redacted>',
        scopes: ['openid'],
      },
      token: { lifetimeSeconds: 3600, refreshTokenEnabled: false },
    },
    { id: 'partner', type: 'external', issuer: 'https://as.partner.example' },
  ],
  federation: {
    mode: 'federation-only',
    entityId: 'https://issuer.example/issuers/acme',
    trustAnchors: [
      {
        entityId: 'https://ta.example',
        entityConfigurationUri: 'https://ta.example/.well-known/openid-federation',
      },
    ],
    authorityHints: ['https://ta.example'],
  },
  registrationCertificate: {
    enabled: true,
    mode: 'generate',
    privacyPolicy: 'https://acme.example/privacy',
    renewal: 'manual',
  },
};

describe('issuer settings form', () => {
  it('fills the form and builds the same settings back, keeping what it does not edit', () => {
    const form = createIssuerSettingsForm();
    const carried = fillIssuerSettingsForm(form, stored);
    expect(carried).toEqual({ authorityHints: ['https://ta.example'] });
    expect(form.valid).toBe(true);
    expect(serverProblems(form)).toBe('');

    expect(issuerSettingsBody(form, carried)).toEqual({
      batchSize: 2,
      display: [{ name: 'Acme', locale: 'en-US', logo: { uri: 'https://acme.example/logo.png' } }],
      dPopRequired: true,
      credentialResponseEncryption: false,
      credentialRequestEncryption: false,
      notificationEndpointEnabled: true,
      txCodeMaxAttempts: 3,
      walletAttestationRequired: true,
      walletAttestationStatusCheckMode: 'strict',
      walletProviderTrustLists: [
        { trustListId: 'wallets' },
        { url: 'https://lists.example/old', verifierKey: { kty: 'EC' } },
      ],
      authorizationServers: [
        {
          id: 'issuer-built-in',
          type: 'built-in',
          label: 'Built-in',
          enabled: true,
          requireDPoP: false,
          token: {
            lifetimeSeconds: 300,
            refreshTokenEnabled: true,
            refreshTokenExpiresInSeconds: 2592000,
          },
        },
        {
          id: 'login',
          type: 'chained',
          label: 'Company login',
          enabled: true,
          requireDPoP: false,
          walletAttestationRequired: false,
          walletProviderTrustLists: [{ trustListId: 'wallets' }],
          token: { lifetimeSeconds: 3600, refreshTokenEnabled: false },
          upstream: {
            issuer: 'https://idp.example',
            clientId: 'eudiplo',
            clientSecret: '<redacted>',
            scopes: ['openid'],
          },
        },
        {
          id: 'partner',
          type: 'external',
          issuer: 'https://as.partner.example',
          label: 'https://as.partner.example',
        },
      ],
      federation: {
        authorityHints: ['https://ta.example'],
        mode: 'federation-only',
        entityId: 'https://issuer.example/issuers/acme',
        cacheTtlSeconds: 300,
        trustAnchors: [
          {
            entityId: 'https://ta.example',
            entityConfigurationUri: 'https://ta.example/.well-known/openid-federation',
          },
        ],
      },
      registrationCertificate: {
        enabled: true,
        mode: 'generate',
        privacyPolicy: 'https://acme.example/privacy',
        renewal: 'manual',
      },
    });
  });

  it('replaces a stored public key once a certificate is pasted', () => {
    const form = createIssuerSettingsForm();
    fillIssuerSettingsForm(form, stored);
    form.controls.trustLists.at(1).controls.certificate.setValue(TEST_ROOT_CERTIFICATE_PEM);
    const body = issuerSettingsBody(form, {}) as unknown as { walletProviderTrustLists: unknown[] };
    expect(body.walletProviderTrustLists[1]).toEqual({
      url: 'https://lists.example/old',
      verifierX509Der: pemToBase64Der(TEST_ROOT_CERTIFICATE_PEM),
    });
  });

  it('names what the backend would refuse about the servers', () => {
    const form = createIssuerSettingsForm();
    expect(serverProblems(form)).toBe('Add at least one enabled authorization server.');
    form.controls.servers.push(createServerGroup({ type: 'oid4vp', id: 'built-in' }));
    expect(serverProblems(form)).toBe(
      'The IDs built-in and chained-as are reserved. Choose another server ID.'
    );
    form.controls.servers.at(0).controls.id.setValue('hosted');
    expect(serverProblems(form)).toBe(
      'Choose a presentation configuration for each hosted presentation.'
    );
  });

  it('sends no federation while it is off', () => {
    const form = createIssuerSettingsForm();
    fillIssuerSettingsForm(form, stored);
    form.controls.federation.controls.enabled.setValue(false);
    expect(
      (issuerSettingsBody(form, {}) as unknown as { federation: unknown }).federation
    ).toBeNull();
  });
});
