import {
  type CreateTenantDto,
  type TenantCreateResponseDto,
  tenantControllerDeleteTenant,
  tenantControllerGetTenant,
  tenantControllerGetTenants,
  tenantControllerInitTenant,
  tenantControllerUpdateTenant,
  type TenantResponseDto,
  type UpdateTenantDto,
} from '@eudiplo/sdk-core';
import { mutationOptions, queryOptions } from '@tanstack/angular-query-experimental';

/** The query key of the tenants of `instance`; the list and the dashboard share it. */
export function tenantsKey(instance: string | undefined) {
  return ['tenants', instance] as const;
}

/** All tenants of the instance (`GET /api/tenant`), for a caller with `tenants:manage`. */
export function tenantsQuery(instance: string | undefined, enabled = true) {
  return queryOptions({
    queryKey: tenantsKey(instance),
    queryFn: async () => (await tenantControllerGetTenants()).data,
    enabled: !!instance && enabled,
  });
}

/** The query key of one tenant; under the list's key, so invalidating the list reloads it too. */
export function tenantKey(instance: string | undefined, id: string) {
  return [...tenantsKey(instance), id] as const;
}

/** One tenant with its clients (`GET /api/tenant/{id}`). */
export function tenantQuery(instance: string | undefined, id: string) {
  return queryOptions({
    queryKey: tenantKey(instance, id),
    queryFn: async (): Promise<TenantResponseDto> =>
      (await tenantControllerGetTenant({ path: { id } })).data,
    enabled: !!instance && !!id,
  });
}

/**
 * Creates a tenant (`POST /api/tenant`). The response holds the secret of its admin client when
 * one was created: the only time the backend returns it.
 */
export function createTenantMutation() {
  return mutationOptions({
    mutationFn: async (body: CreateTenantDto): Promise<TenantCreateResponseDto> =>
      (await tenantControllerInitTenant({ body })).data,
  });
}

/** Changes the name, description or settings of a tenant (`PATCH /api/tenant/{id}`). */
export function updateTenantMutation() {
  return mutationOptions({
    mutationFn: async ({ id, body }: { id: string; body: UpdateTenantDto }) =>
      (await tenantControllerUpdateTenant({ path: { id }, body })).data,
  });
}

/** Deletes a tenant and all its data (`DELETE /api/tenant/{id}`); the variable is its ID. */
export function deleteTenantMutation() {
  return mutationOptions({
    mutationFn: async (id: string) => {
      await tenantControllerDeleteTenant({ path: { id } });
    },
  });
}
