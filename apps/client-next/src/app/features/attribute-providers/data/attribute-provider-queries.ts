import {
  type AttributeProviderEntity,
  attributeProviderControllerCreate,
  attributeProviderControllerDelete,
  attributeProviderControllerGetById,
  attributeProviderControllerUpdate,
  type CreateAttributeProviderDto,
  type UpdateAttributeProviderDto,
} from '@eudiplo/sdk-core';
import { mutationOptions, queryOptions } from '@tanstack/angular-query-experimental';

/**
 * The tenant's attribute providers. The list query lives with the issuance data
 * (`attributeProvidersQuery`), as the offer page uses it too; one provider's key is under it.
 */

type Instance = string | undefined;
type Tenant = string | null | undefined;

export const attributeProvidersKey = (instance: Instance, tenant: Tenant) =>
  ['attribute-providers', instance, tenant] as const;

/** One attribute provider (`GET /api/issuer/attribute-providers/{id}`); its key is never returned. */
export function attributeProviderQuery(instance: Instance, tenant: Tenant, id: string) {
  return queryOptions({
    queryKey: [...attributeProvidersKey(instance, tenant), id] as const,
    queryFn: async (): Promise<AttributeProviderEntity> =>
      (await attributeProviderControllerGetById({ path: { id } })).data,
    enabled: !!instance && !!id,
  });
}

/** Registers an attribute provider (`POST /api/issuer/attribute-providers`). */
export function createAttributeProviderMutation() {
  return mutationOptions({
    mutationFn: async (body: CreateAttributeProviderDto): Promise<AttributeProviderEntity> =>
      (await attributeProviderControllerCreate({ body })).data,
  });
}

/** Changes an attribute provider (`PATCH /api/issuer/attribute-providers/{id}`). */
export function updateAttributeProviderMutation() {
  return mutationOptions({
    mutationFn: async ({
      id,
      body,
    }: {
      id: string;
      body: UpdateAttributeProviderDto;
    }): Promise<AttributeProviderEntity> =>
      (await attributeProviderControllerUpdate({ path: { id }, body })).data,
  });
}

/** Deletes an attribute provider (`DELETE /api/issuer/attribute-providers/{id}`). */
export function deleteAttributeProviderMutation() {
  return mutationOptions({
    mutationFn: async (id: string): Promise<void> => {
      await attributeProviderControllerDelete({ path: { id } });
    },
  });
}
