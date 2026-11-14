import type { KeyChainResponseDto } from '@eudiplo/sdk-core';
import { describe, expect, it } from 'vitest';
import {
  accessReadiness,
  originProblem,
  parseTransactionData,
  requestedCredentials,
} from './verification-request';

const chain = (id: string, usageType: string, certificate = true) =>
  ({
    id,
    usageType,
    activeCertificate: certificate ? { pem: '-----BEGIN CERTIFICATE-----' } : undefined,
  }) as unknown as KeyChainResponseDto;

describe('accessReadiness', () => {
  it('needs an access key chain at all', () => {
    expect(accessReadiness({}, [chain('sig', 'attestation')], {})).toEqual({
      ready: false,
      reason:
        'No access key chain is configured. Create an access key chain and its access certificate first.',
    });
  });

  it("checks the configuration's own access key chain and its certificate", () => {
    const chains = [chain('reader', 'access'), chain('old', 'access', false)];
    expect(accessReadiness({ accessKeyChainId: 'reader' }, chains, {})).toEqual({ ready: true });
    expect(accessReadiness({ accessKeyChainId: 'old' }, chains, {})).toMatchObject({
      ready: false,
      reason: expect.stringContaining('old has no active access certificate'),
    });
    expect(accessReadiness({ accessKeyChainId: 'gone' }, chains, {})).toMatchObject({
      ready: false,
      reason: expect.stringContaining('gone of this configuration does not exist'),
    });
  });

  it("else the tenant's default, else any access key chain with a certificate", () => {
    const chains = [chain('reader', 'access'), chain('old', 'access', false)];
    expect(
      accessReadiness({}, chains, { defaultAccessKeyChainId: 'old', keyChainId: 'old' })
    ).toMatchObject({
      ready: false,
      reason: expect.stringContaining('default access key chain old'),
    });
    expect(accessReadiness({}, chains, {})).toEqual({ ready: true });
    expect(accessReadiness({}, [chain('old', 'access', false)], {})).toMatchObject({
      ready: false,
    });
  });
});

describe('originProblem', () => {
  it("names an origin that the configuration's allowed origins leave out", () => {
    const config = { id: 'pid', allowedOrigins: ['https://shop.example'] };
    expect(originProblem(config, false, 'https://admin.example')).toBe('');
    expect(originProblem(config, true, 'https://shop.example')).toBe('');
    expect(originProblem({ id: 'pid' }, true, 'https://admin.example')).toBe('');
    expect(originProblem(config, true, 'https://admin.example')).toContain(
      "does not list this page's origin, https://admin.example"
    );
  });
});

describe('parseTransactionData', () => {
  it('takes a list of entries with a type and credential IDs, or nothing', () => {
    expect(parseTransactionData('  ')).toBeUndefined();
    expect(parseTransactionData('[{"type":"payment","credential_ids":["pid"]}]')).toEqual([
      { type: 'payment', credential_ids: ['pid'] },
    ]);
  });

  it('says what is wrong', () => {
    expect(() => parseTransactionData('{')).toThrow('This is not valid JSON');
    expect(() => parseTransactionData('{}')).toThrow('Enter a JSON array');
    expect(() => parseTransactionData('[{"credential_ids":["pid"]}]')).toThrow(
      'Entry 1 needs a "type".'
    );
    expect(() => parseTransactionData('[{"type":"x","credential_ids":[]}]')).toThrow(
      'Entry 1 needs "credential_ids"'
    );
  });
});

describe('requestedCredentials', () => {
  it('lists the credentials of the DCQL query with their type and number of claims', () => {
    expect(
      requestedCredentials({
        dcql_query: {
          credentials: [
            {
              id: 'pid',
              format: 'dc+sd-jwt',
              meta: { vct_values: ['urn:eudi:pid:1'] },
              claims: [{ path: ['given_name'] }, { path: ['family_name'] }],
            },
            { id: 'mdl', format: 'mso_mdoc', meta: { doctype_value: 'org.iso.18013.5.1.mDL' } },
          ],
        },
      } as never)
    ).toEqual([
      { id: 'pid', format: 'dc+sd-jwt', type: 'urn:eudi:pid:1', claims: 2 },
      { id: 'mdl', format: 'mso_mdoc', type: 'org.iso.18013.5.1.mDL', claims: 0 },
    ]);
  });
});
