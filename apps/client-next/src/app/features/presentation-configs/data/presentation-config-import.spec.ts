import type {
  CredentialIssuerMetadataDto,
  ResolvedSchemaMetadataResponseDto,
} from '@eudiplo/sdk-core';
import { describe, expect, it } from 'vitest';
import { dcqlFromIssuer, dcqlFromSchema } from './presentation-config-import';

describe('presentation query imports', () => {
  it('normalizes issuer credential formats, claim paths and duplicate IDs', () => {
    const metadata = {
      credential_configurations_supported: {
        PID: {
          format: 'vc+sd-jwt',
          vct: 'urn:example:pid',
          credential_metadata: {
            claims: [{ path: ['given_name'] }, { path: ['address', 'locality'] }],
          },
        },
        pid: {
          format: 'mso_mdoc',
          doctype: 'org.iso.18013.5.1.mDL',
          claims_namespaced: {
            'org.iso.18013.5.1': { family_name: {} },
          },
        },
        ignored: { format: 'jwt_vc_json', vct: 'urn:unsupported' },
      },
    } as unknown as CredentialIssuerMetadataDto;

    expect(dcqlFromIssuer(metadata)).toEqual({
      credentials: [
        {
          id: 'pid',
          format: 'dc+sd-jwt',
          meta: { vct_values: ['urn:example:pid'] },
          claims: [{ path: ['given_name'] }, { path: ['address', 'locality'] }],
        },
        {
          id: 'pid_2',
          format: 'mso_mdoc',
          meta: { doctype_value: 'org.iso.18013.5.1.mDL' },
          claims: [{ path: ['org.iso.18013.5.1', 'family_name'] }],
        },
      ],
    });
  });

  it('keeps the resolved schema credentials and derives a suggested configuration name', () => {
    const result = dcqlFromSchema({
      signedJwt: 'signed',
      schema: {
        id: 'schema-id',
        name: 'Age Check',
        version: '1.2.0',
        dcqlQuery: {
          credentials: [{ id: 'pid', format: 'dc+sd-jwt' }],
          credential_sets: [{ options: [['pid']] }],
        },
      },
    } as unknown as ResolvedSchemaMetadataResponseDto);

    expect(result).toEqual({
      query: {
        credentials: [{ id: 'pid', format: 'dc+sd-jwt' }],
        credential_sets: [{ options: [['pid']] }],
      },
      id: 'age_check_v1_2_0',
      description: 'Imported from schema Age Check (v1.2.0)',
    });
  });

  it('rejects issuer or schema metadata without supported credential queries', () => {
    expect(() =>
      dcqlFromIssuer({
        credential_configurations_supported: {},
      } as unknown as CredentialIssuerMetadataDto)
    ).toThrow('Issuer metadata has no supported');
    expect(() =>
      dcqlFromSchema({
        signedJwt: 'signed',
        schema: { id: 'empty', dcqlQuery: { credentials: [] } },
      } as unknown as ResolvedSchemaMetadataResponseDto)
    ).toThrow('did not resolve to a DCQL');
  });
});
