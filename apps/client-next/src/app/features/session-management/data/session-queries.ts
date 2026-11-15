import {
  credentialConfigControllerGetConfigs,
  presentationManagementControllerConfiguration,
  sessionConfigControllerGetConfig,
  sessionConfigControllerResetConfig,
  sessionConfigControllerUpdateConfig,
  sessionControllerCancel,
  sessionControllerDeleteSession,
  sessionControllerGetAllSessions,
  sessionControllerGetCredentialStatus,
  sessionControllerGetSessionLogs,
  sessionControllerRevokeAll,
  type CredentialStatusDto,
  type SessionLogEntryResponseDto,
  type PaginatedSessionResponseDto,
  type SessionStorageConfig,
  type UpdateSessionConfigDto,
} from '@eudiplo/sdk-core';
import { mutationOptions, queryOptions } from '@tanstack/angular-query-experimental';
import { sessionQueryFromState, type SessionListState } from './session-list-state';

type Instance = string | undefined;
type Tenant = string | null | undefined;

/** The current page of the caller's sessions, filtered and sorted by the backend. */
export function sessionsQuery(instance: Instance, tenant: Tenant, state: SessionListState) {
  return queryOptions({
    queryKey: ['sessions', instance, tenant, 'list', state] as const,
    queryFn: async (): Promise<PaginatedSessionResponseDto> =>
      (await sessionControllerGetAllSessions({ query: sessionQueryFromState(state) })).data,
    enabled: !!instance,
    staleTime: 15_000,
  });
}

/** Configuration choices used by the session filters. Each endpoint is enabled only for its managers. */
export function sessionConfigOptionsQuery(
  instance: Instance,
  tenant: Tenant,
  kind: 'issuance' | 'presentation',
  enabled: boolean
) {
  return queryOptions({
    queryKey: ['session-config-options', kind, instance, tenant] as const,
    queryFn: async () =>
      kind === 'issuance'
        ? ((await credentialConfigControllerGetConfigs()).data ?? [])
        : ((await presentationManagementControllerConfiguration()).data ?? []),
    enabled: !!instance && enabled,
    retry: false,
  });
}

export const sessionRetentionKey = (instance: Instance, tenant: Tenant) =>
  ['session-retention', instance, tenant] as const;

/** The tenant's session retention overrides; an empty object follows instance defaults. */
export function sessionRetentionQuery(instance: Instance, tenant: Tenant) {
  return queryOptions({
    queryKey: sessionRetentionKey(instance, tenant),
    queryFn: async (): Promise<SessionStorageConfig> =>
      (await sessionConfigControllerGetConfig({ parseAs: 'json' })).data ?? {},
    enabled: !!instance,
  });
}

export function saveSessionRetentionMutation() {
  return mutationOptions({
    mutationFn: async (body: UpdateSessionConfigDto): Promise<SessionStorageConfig> =>
      (await sessionConfigControllerUpdateConfig({ body })).data,
  });
}

export function resetSessionRetentionMutation() {
  return mutationOptions({
    mutationFn: async (): Promise<void> => {
      await sessionConfigControllerResetConfig();
    },
  });
}

export function cancelSessionMutation() {
  return mutationOptions({
    mutationFn: async ({ id, reason }: { id: string; reason?: string }): Promise<void> => {
      await sessionControllerCancel({
        path: { id },
        body: reason ? { reason } : {},
      });
    },
  });
}

export function deleteSessionMutation() {
  return mutationOptions({
    mutationFn: async (id: string): Promise<void> => {
      await sessionControllerDeleteSession({ path: { id } });
    },
  });
}

/**
 * The log of a session (`GET /api/session/{id}/logs`). Empty when the instance keeps no session
 * logs (`LOG_SESSION_STORE` off), which the backend answers with an error.
 */
export function sessionLogsQuery(instance: Instance, tenant: Tenant, id: string) {
  return queryOptions({
    queryKey: ['sessions', instance, tenant, id, 'logs'] as const,
    queryFn: async (): Promise<SessionLogEntryResponseDto[]> => {
      try {
        return (await sessionControllerGetSessionLogs({ path: { id } })).data ?? [];
      } catch {
        return [];
      }
    },
    enabled: !!instance && !!id,
  });
}

/** The status of every credential an issuance session issued with one. */
export function credentialStatusQuery(
  instance: Instance,
  tenant: Tenant,
  id: string,
  enabled: boolean
) {
  return queryOptions({
    queryKey: ['sessions', instance, tenant, id, 'credential-status'] as const,
    queryFn: async (): Promise<CredentialStatusDto[]> =>
      (await sessionControllerGetCredentialStatus({ path: { id } })).data ?? [],
    enabled: !!instance && !!id && enabled,
  });
}

/**
 * Sets the status of the credentials a session issued of one credential type
 * (`POST /api/session/revoke`). Revocation is final.
 */
export function updateCredentialStatusMutation() {
  return mutationOptions({
    mutationFn: async (body: {
      sessionId: string;
      status: number;
      credentialConfigurationId: string;
    }): Promise<void> => {
      await sessionControllerRevokeAll({ body });
    },
  });
}
