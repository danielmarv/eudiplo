import type { IssuanceConfig, PresentationConfig } from '@eudiplo/sdk-core';

export interface FederationTrustAnchorReferences {
  issuance: boolean;
  presentations: PresentationConfig[];
}

export function referencesToFederationTrustAnchor(
  entityId: string,
  issuance: IssuanceConfig | undefined,
  presentations: readonly PresentationConfig[] | undefined
): FederationTrustAnchorReferences {
  return {
    issuance: (issuance?.federation?.trustAnchors ?? []).some(
      (anchor) => anchor.entityId === entityId
    ),
    presentations: (presentations ?? []).filter((config) =>
      (config.dcql_query?.credentials ?? []).some((credential) =>
        (credential.trusted_authorities ?? []).some(
          (authority) =>
            authority.type === 'openid_federation' && authority.values.includes(entityId)
        )
      )
    ),
  };
}

export function describeFederationTrustAnchorReferences(
  references: FederationTrustAnchorReferences
): string {
  const uses: string[] = [];
  if (references.issuance) uses.push('the issuance configuration');
  const count = references.presentations.length;
  if (count) uses.push(`${count} presentation configuration${count === 1 ? '' : 's'}`);
  return uses.join(' and ');
}
