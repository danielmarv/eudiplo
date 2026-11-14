import { appControllerGetFrontendConfig, type FrontendConfigResponseDto } from '@eudiplo/sdk-core';
import { queryOptions } from '@tanstack/angular-query-experimental';

/** How the management API authenticates; with `generic` the identity provider manages clients and people. */
export type AuthMode = 'builtin' | 'keycloak' | 'generic';

/**
 * What the backend tells the Web Client about itself (`GET /api/frontend-config`), per
 * instance: signing in to another instance loads it again. It changes only with a restart
 * of the backend, so it never goes stale within a session.
 */
export function frontendConfigQuery(instanceUrl: string | undefined) {
  return queryOptions({
    queryKey: ['frontend-config', instanceUrl] as const,
    queryFn: async (): Promise<FrontendConfigResponseDto> =>
      (await appControllerGetFrontendConfig()).data,
    enabled: !!instanceUrl,
    staleTime: Infinity,
  });
}

/** People are managed in the Web Client only with Keycloak; until the mode is known the entry stays. */
export function managesUsers(authMode: AuthMode | undefined): boolean {
  return authMode === undefined || authMode === 'keycloak';
}

/** With another identity provider, that provider manages the API clients. */
export function managesClients(authMode: AuthMode | undefined): boolean {
  return authMode !== 'generic';
}
