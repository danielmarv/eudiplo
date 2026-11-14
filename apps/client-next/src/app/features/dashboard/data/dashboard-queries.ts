import {
  presentationManagementControllerConfiguration,
  sessionControllerGetAllSessions,
  sessionControllerGetSessionStats,
} from '@eudiplo/sdk-core';
import { queryOptions } from '@tanstack/angular-query-experimental';

/**
 * The dashboard's queries. Each key starts with the resource and holds the instance URL, and
 * a tenant's data also its tenant, so signing in elsewhere never shows another one's data.
 * `enabled` is false when the caller's roles do not include the resource: the query then
 * never runs, and the section stays hidden.
 */

/** Sessions created since `since`, counted per type and status. */
export function sessionStatsQuery(
  instance: string | undefined,
  tenant: string | null | undefined,
  since: string,
  enabled: boolean
) {
  return queryOptions({
    queryKey: ['session-stats', instance, tenant, since] as const,
    queryFn: async () =>
      (await sessionControllerGetSessionStats({ query: { createdFrom: since } })).data,
    enabled: !!instance && enabled,
    refetchInterval: 60_000,
  });
}

export function recentSessionsQuery(
  instance: string | undefined,
  tenant: string | null | undefined,
  enabled: boolean
) {
  return queryOptions({
    queryKey: ['sessions', instance, tenant, 'recent'] as const,
    queryFn: async () =>
      (await sessionControllerGetAllSessions({ query: { page: 1, pageSize: 6 } })).data,
    enabled: !!instance && enabled,
    refetchInterval: 30_000,
  });
}

export function presentationConfigsQuery(
  instance: string | undefined,
  tenant: string | null | undefined,
  enabled: boolean
) {
  return queryOptions({
    queryKey: ['presentation-configs', instance, tenant] as const,
    queryFn: async () => (await presentationManagementControllerConfiguration()).data,
    enabled: !!instance && enabled,
  });
}
