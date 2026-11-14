import type { CredentialConfig, PresentationConfig, TrustList } from '@eudiplo/sdk-core';
import { describe, expect, it } from 'vitest';
import {
  createEntityForm,
  credentialConfigReferencesTrustList,
  entityFormsFromTrustList,
  entityPayload,
  presentationConfigReferencesTrustList,
  trustListBody,
  trustListControlPath,
} from './trust-list-data';

const list = {
  id: 'membership-issuers',
  tenantId: 'membership-demo',
  entityConfig: [
    {
      type: 'external',
      issuerCertPem: 'issuer',
      revocationCertPem: 'revocation',
      info: {
        name: 'Example',
        lang: 'en',
        contactUri: 'info@example.com',
        website: 'https://example.com/',
      },
    },
  ],
} as unknown as TrustList;

describe('trust list forms', () => {
  it('requires an entity and the electronic address fields, and only the selected certificate inputs', () => {
    const internal = createEntityForm('internal');
    const external = createEntityForm('external');

    expect(internal.invalid).toBe(true);
    expect(internal.controls.issuerKeyChainId.hasError('required')).toBe(true);
    expect(internal.controls.issuerCertPem.valid).toBe(true);
    expect(external.controls.issuerCertPem.hasError('required')).toBe(true);
    expect(external.controls.issuerKeyChainId.valid).toBe(true);

    external.patchValue({
      issuerCertPem: 'issuer',
      revocationCertPem: 'revocation',
      infoName: 'Example',
      infoContactUri: 'info@example.com',
      infoWebsite: 'https://example.com/',
    });
    expect(external.valid).toBe(true);
    external.controls.infoWebsite.setValue('https://Example.com/');
    expect(external.controls.infoWebsite.hasError('serializedUrl')).toBe(true);
  });

  it('loads stored entities and preserves required fields in the API body', () => {
    const forms = entityFormsFromTrustList(list);

    expect(forms).toHaveLength(1);
    expect(
      trustListBody({ id: 'membership-issuers', description: ' List ', keyChainId: '' }, forms)
    ).toEqual({
      id: 'membership-issuers',
      description: 'List',
      entities: [
        {
          type: 'external',
          providerType: 'attestation-provider',
          issuerCertPem: 'issuer',
          revocationCertPem: 'revocation',
          info: {
            name: 'Example',
            lang: 'en',
            contactUri: 'info@example.com',
            website: 'https://example.com/',
          },
        },
      ],
    });
  });

  it('maps server info paths to the flattened controls and ignores the uneditable type field', () => {
    expect(trustListControlPath('entities.0.info.contactUri')).toBe('entities.0.infoContactUri');
    expect(trustListControlPath('entities.2.issuerCertPem')).toBe('entities.2.issuerCertPem');
    expect(trustListControlPath('entities.0.type')).toBeUndefined();
  });

  it('recognizes managed-list references by ID or exact tenant URL', () => {
    const credential = {
      schemaMeta: { trustedAuthorities: [{ trustListId: list.id }] },
    } as unknown as CredentialConfig;
    const presentation = {
      dcql_query: {
        credentials: [
          {
            trusted_authorities: [
              {
                type: 'etsi_tl',
                values: [{ url: '<TENANT_URL>/trust-list/membership-issuers' }],
              },
            ],
          },
        ],
      },
    } as unknown as PresentationConfig;
    const wrongList = {
      dcql_query: {
        credentials: [
          {
            trusted_authorities: [
              {
                type: 'etsi_tl',
                values: [
                  {
                    url: 'https://example.com/issuers/membership-demo/trust-list/membership-issuers-old',
                  },
                ],
              },
            ],
          },
        ],
      },
    } as unknown as PresentationConfig;

    expect(credentialConfigReferencesTrustList(credential, list)).toBe(true);
    expect(presentationConfigReferencesTrustList(presentation, list)).toBe(true);
    expect(presentationConfigReferencesTrustList(wrongList, list)).toBe(false);
  });

  it('falls back to editing published entity data when original config is missing', () => {
    const legacy = {
      ...list,
      entityConfig: undefined,
      data: {
        LoTE: {
          TrustedEntitiesList: [
            {
              TrustedEntityInformation: {
                TEName: [{ lang: 'en', value: 'Legacy issuer' }],
                TEAddress: {
                  TEElectronicAddress: [
                    { uriValue: 'mailto:info@example.com' },
                    { uriValue: 'https://example.com/' },
                  ],
                },
              },
              TrustedEntityServices: [],
            },
          ],
        },
      },
    } as unknown as TrustList;

    const forms = entityFormsFromTrustList(legacy);
    expect(forms).toHaveLength(1);
    expect(forms[0].controls.infoName.value).toBe('Legacy issuer');
    expect(forms[0].controls.infoContactUri.value).toBe('info@example.com');
    expect(forms[0].controls.infoWebsite.value).toBe('https://example.com/');
  });

  it('normalizes optional whitespace out of entity values', () => {
    const form = createEntityForm('internal', {
      issuerKeyChainId: ' issuer ',
      revocationKeyChainId: ' revocation ',
      infoName: 'Example',
      infoContactUri: 'info@example.com',
      infoWebsite: 'https://example.com/',
      infoPhone: '   ',
    });
    const payload = entityPayload(form);
    expect(payload).toMatchObject({
      type: 'internal',
      issuerKeyChainId: ' issuer ',
      info: { contactUri: 'info@example.com' },
    });
    expect(payload.info).not.toHaveProperty('phone');
  });
});
