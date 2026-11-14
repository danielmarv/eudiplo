import type { CredentialConfig, IssuanceConfig } from '@eudiplo/sdk-core';
import { describe, expect, it } from 'vitest';
import {
  buildOfferRequest,
  claimsForForm,
  claimsForSubmission,
  configsForFlow,
  formFlowOf,
  schemaForForm,
  serverOptionsForFlow,
} from './offer-request';

const issuer = (servers: unknown[]) => ({ authorizationServers: servers }) as IssuanceConfig;
const config = (id: string, extra: Partial<CredentialConfig> = {}) =>
  ({ id, config: { format: 'dc+sd-jwt' }, fields: [], ...extra }) as unknown as CredentialConfig;
const mdl = config('mdl', {
  config: { format: 'mso_mdoc' } as CredentialConfig['config'],
  fields: [
    { path: ['org.iso.18013.5.1', 'family_name'], type: 'string' },
  ] as CredentialConfig['fields'],
});

describe('serverOptionsForFlow', () => {
  const servers = issuer([
    { type: 'built-in', id: 'built-in', label: 'EUDIPLO' },
    { type: 'external', id: 'keycloak', issuer: 'https://idp.test' },
    { type: 'oid4vp', id: 'wallet-login', presentationConfigId: 'pid' },
    { type: 'chained', id: 'bank', upstream: {} },
    { type: 'external', id: 'old-idp', issuer: 'https://old.test', enabled: false },
  ]);

  it('offers the enabled servers in the configured order, with a label each', () => {
    expect(serverOptionsForFlow(servers, 'pre_authorized_code')).toEqual([
      { value: 'built-in', label: 'EUDIPLO' },
      { value: 'keycloak', label: 'keycloak' },
      { value: 'wallet-login', label: 'wallet-login' },
      { value: 'bank', label: 'Chained Authorization Server' },
    ]);
  });

  it('leaves out the built-in server for the authorization code flow, and offers none for IAE', () => {
    expect(
      serverOptionsForFlow(servers, 'authorization_code_external').map((o) => o.value)
    ).toEqual(['keycloak', 'wallet-login', 'bank']);
    expect(serverOptionsForFlow(servers, 'authorization_code_iae')).toEqual([]);
  });

  it('offers nothing without servers', () => {
    expect(serverOptionsForFlow(issuer([]), 'pre_authorized_code')).toEqual([]);
    expect(serverOptionsForFlow(undefined, 'authorization_code_external')).toEqual([]);
  });
});

describe('configsForFlow', () => {
  it('offers credentials with IAE steps for the IAE flow only', () => {
    const plain = config('student-id');
    const iae = config('age', { iaeActions: [{}] as CredentialConfig['iaeActions'] });

    expect(configsForFlow([plain, iae], 'pre_authorized_code')).toEqual([plain]);
    expect(configsForFlow([plain, iae], 'authorization_code_external')).toEqual([plain]);
    expect(configsForFlow([plain, iae], 'authorization_code_iae')).toEqual([iae]);
  });
});

describe('mdoc namespaces', () => {
  const schema = {
    type: 'object',
    properties: {
      'org.iso.18013.5.1': { type: 'object', properties: { family_name: { type: 'string' } } },
    },
  };

  it('shows an mdoc credential without its namespace and sends it inside it', () => {
    expect(schemaForForm(mdl, schema)).toEqual(schema.properties['org.iso.18013.5.1']);
    expect(claimsForForm(mdl, { 'org.iso.18013.5.1': { family_name: 'Doe' } })).toEqual({
      family_name: 'Doe',
    });
    expect(claimsForSubmission(mdl, { family_name: 'Doe' })).toEqual({
      'org.iso.18013.5.1': { family_name: 'Doe' },
    });
    expect(claimsForSubmission(mdl, { 'org.iso.18013.5.1': {} })).toEqual({
      'org.iso.18013.5.1': {},
    });
  });

  it('leaves the claims of other formats as they are', () => {
    const sdJwt = config('student-id');
    expect(schemaForForm(sdJwt, schema)).toBe(schema);
    expect(claimsForSubmission(sdJwt, { given_name: 'Erika' })).toEqual({ given_name: 'Erika' });
  });
});

describe('formFlowOf', () => {
  const iae = config('age', { iaeActions: [{}] as CredentialConfig['iaeActions'] });

  it('tells the IAE flow from the external server flow by the server and the credentials', () => {
    const base = { response_type: 'uri' as const, credentialConfigurationIds: ['age'] };
    expect(formFlowOf({ ...base, flow: 'pre_authorized_code' }, [iae])).toBe('pre_authorized_code');
    expect(formFlowOf({ ...base, flow: 'authorization_code' }, [iae])).toBe(
      'authorization_code_iae'
    );
    expect(
      formFlowOf({ ...base, flow: 'authorization_code', authorization_server: 'keycloak' }, [iae])
    ).toBe('authorization_code_external');
  });
});

describe('buildOfferRequest', () => {
  it('sends the claims of a pre-authorized offer, its transaction code and server', () => {
    expect(
      buildOfferRequest(
        {
          flow: 'pre_authorized_code',
          credentialIds: ['student-id', 'mdl', 'staff-id'],
          claims: {
            'student-id': { kind: 'form', claims: { given_name: 'Erika' } },
            mdl: { kind: 'form', claims: { family_name: 'Doe' } },
            'staff-id': { kind: 'attributeProvider', providerId: 'hr' },
          },
          providers: {},
          txCode: ' 1234 ',
          txCodeDescription: 'Sent by mail',
          authorizationServer: 'built-in',
        },
        [config('student-id'), mdl]
      )
    ).toEqual({
      flow: 'pre_authorized_code',
      response_type: 'uri',
      credentialConfigurationIds: ['student-id', 'mdl', 'staff-id'],
      credentialClaims: {
        'student-id': { type: 'inline', claims: { given_name: 'Erika' } },
        mdl: { type: 'inline', claims: { 'org.iso.18013.5.1': { family_name: 'Doe' } } },
        'staff-id': { type: 'attributeProvider', attributeProviderId: 'hr' },
      },
      tx_code: '1234',
      tx_code_description: 'Sent by mail',
      authorization_server: 'built-in',
    });
  });

  it('sends the attribute providers of an authorization code offer, and no server for IAE', () => {
    const choices = {
      credentialIds: ['student-id', 'age'],
      claims: {},
      providers: { 'student-id': 'campus', age: '' },
      txCode: '1234',
      authorizationServer: 'keycloak',
    };
    expect(buildOfferRequest({ ...choices, flow: 'authorization_code_external' }, [])).toEqual({
      flow: 'authorization_code',
      response_type: 'uri',
      credentialConfigurationIds: ['student-id', 'age'],
      credentialClaims: {
        'student-id': { type: 'attributeProvider', attributeProviderId: 'campus' },
      },
      authorization_server: 'keycloak',
    });
    expect(
      buildOfferRequest({ ...choices, flow: 'authorization_code_iae' }, [])
    ).not.toHaveProperty('authorization_server');
  });
});
