import type { CredentialConfig } from '@eudiplo/sdk-core';
import { duration } from '../../../shared/format/duration';

export type CredentialFormat = CredentialConfig['config']['format'];

export const FORMAT_LABELS: Record<CredentialFormat, string> = {
  'dc+sd-jwt': 'SD-JWT VC',
  mso_mdoc: 'mdoc',
};

/** The embedded disclosure policies the backend knows, by what they ask of a verifier. */
const POLICY_LABELS: Record<string, string> = {
  none: 'None',
  allowList: 'Allow list',
  rootOfTrust: 'Root of trust',
  attestationBased: 'Verifier attestation',
};

/** The name wallets show for the credential, from its first display entry, else its ID. */
export function displayName(config: CredentialConfig): string {
  return config.config.display?.[0]?.name || config.id;
}

/** The description wallets show, else the configuration's own. */
export function descriptionOf(config: CredentialConfig): string {
  return config.config.display?.[0]?.description || config.description || '';
}

/** How long an issued credential stays valid; without a lifetime it does not expire. */
export function lifetimeLabel(config: CredentialConfig): string {
  return config.lifeTime ? duration(config.lifeTime) : 'No expiry';
}

export function policyLabel(config: CredentialConfig): string {
  const policy = config.embeddedDisclosurePolicy?.policy;
  return policy ? (POLICY_LABELS[policy] ?? policy) : 'None';
}

/** The schema metadata created for the credential at the registrar, if any. */
export function schemaIdOf(config: CredentialConfig): string | undefined {
  const id = config.schemaMeta?.id?.trim();
  return id || undefined;
}
