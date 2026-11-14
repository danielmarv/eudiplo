import type { AttributeProviderEntity, CredentialConfig } from '@eudiplo/sdk-core';

/** How the provider authenticates: "API key in X-API-Key", or "None". */
export function authLabel(provider: Pick<AttributeProviderEntity, 'auth'>): string {
  const auth = provider.auth as { type?: string; config?: { headerName?: string } } | undefined;
  if (auth?.type !== 'apiKey') return 'None';
  return auth.config?.headerName ? `API key in ${auth.config.headerName}` : 'API key';
}

/** The URL's host, to tell providers apart at a glance; the URL itself when it has none. */
export function hostOf(url: string): string {
  try {
    return new URL(url).host || url;
  } catch {
    return url;
  }
}

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
