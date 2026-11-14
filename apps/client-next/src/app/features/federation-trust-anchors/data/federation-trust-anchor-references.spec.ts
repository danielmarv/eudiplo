import type { IssuanceConfig, PresentationConfig } from '@eudiplo/sdk-core';
import { describe, expect, it } from 'vitest';
import {
  describeFederationTrustAnchorReferences,
  referencesToFederationTrustAnchor,
} from './federation-trust-anchor-references';

describe('federation trust anchor references', () => {
  it('finds the entity ID in issuance and presentation configurations', () => {
    const references = referencesToFederationTrustAnchor(
      'https://anchor.example',
      {
        authorizationServers: [],
        federation: { trustAnchors: [{ entityId: 'https://anchor.example' }] },
      } as unknown as IssuanceConfig,
      [
        {
          id: 'age-check',
          description: 'Age check',
          dcql_query: {
            credentials: [
              {
                trusted_authorities: [
                  { type: 'openid_federation', values: ['https://anchor.example'] },
                ],
              },
            ],
          },
        },
        { id: 'other', dcql_query: { credentials: [] } },
      ] as PresentationConfig[]
    );

    expect(references.issuance).toBe(true);
    expect(references.presentations.map((config) => config.id)).toEqual(['age-check']);
    expect(describeFederationTrustAnchorReferences(references)).toBe(
      'the issuance configuration and 1 presentation configuration'
    );
  });

  it('describes an unused anchor as having no visible references', () => {
    const references = referencesToFederationTrustAnchor('https://anchor.example', undefined, []);
    expect(describeFederationTrustAnchorReferences(references)).toBe('');
  });
});
