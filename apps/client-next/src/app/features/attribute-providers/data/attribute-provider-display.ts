import type { CredentialConfig } from '@eudiplo/sdk-core';

/** The credential types that fetch their claims from each provider, by provider ID. */
export function usersByProvider(
  configs: readonly CredentialConfig[] | undefined
): Map<string, CredentialConfig[]> {
  const users = new Map<string, CredentialConfig[]>();
  for (const config of configs ?? []) {
    if (!config.attributeProviderId) continue;
    users.set(config.attributeProviderId, [
      ...(users.get(config.attributeProviderId) ?? []),
      config,
    ]);
  }
  return users;
}
