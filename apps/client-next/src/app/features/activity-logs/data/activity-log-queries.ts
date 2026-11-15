import { type AuditLogResponseDto, auditLogControllerGetAuditLogs } from '@eudiplo/sdk-core';
import { queryOptions } from '@tanstack/angular-query-experimental';

export type ActivityEntry = AuditLogResponseDto;

/** The most entries the backend returns in one request. */
export const ACTIVITY_LIMIT = 500;

/** The tenant's latest configuration changes, newest first (`GET /api/admin/audit-logs`). */
export function activityLogQuery(instance: string | undefined, tenant: string | null | undefined) {
  return queryOptions({
    queryKey: ['activity-log', instance, tenant] as const,
    queryFn: async (): Promise<ActivityEntry[]> =>
      (await auditLogControllerGetAuditLogs({ query: { limit: ACTIVITY_LIMIT } })).data ?? [],
    enabled: !!instance,
  });
}
