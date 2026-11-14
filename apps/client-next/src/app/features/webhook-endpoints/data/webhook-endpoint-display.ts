import type { CredentialConfig, PresentationConfig } from '@eudiplo/sdk-core';

/** A configuration that sends its notifications to a webhook endpoint. */
export interface EndpointUser {
  kind: 'credential' | 'presentation';
  id: string;
  name: string;
  /** Where it opens in the Web Client. */
  link: string[];
}

/**
 * The configurations that use each endpoint, by endpoint ID: credential types send it the wallet
 * unit revocations of their credentials, presentation configurations the result of each request.
 */
export function usersByEndpoint(
  credentials: readonly CredentialConfig[] | undefined,
  presentations: readonly PresentationConfig[] | undefined
): Map<string, EndpointUser[]> {
  const users = new Map<string, EndpointUser[]>();
  const add = (endpoint: string | null | undefined, user: EndpointUser) => {
    if (endpoint) users.set(endpoint, [...(users.get(endpoint) ?? []), user]);
  };
  for (const config of credentials ?? []) {
    add(config.webhookEndpointId, {
      kind: 'credential',
      id: config.id,
      name: config.config.display?.[0]?.name || config.id,
      link: ['/credential-config', config.id],
    });
  }
  for (const config of presentations ?? []) {
    add(config.webhookEndpointId, {
      kind: 'presentation',
      id: config.id,
      name: config.description || config.id,
      link: ['/presentation-config', config.id],
    });
  }
  return users;
}
