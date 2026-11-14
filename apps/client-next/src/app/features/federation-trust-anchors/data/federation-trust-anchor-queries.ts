import {
  federationTrustAnchorControllerCreate,
  federationTrustAnchorControllerDelete,
  federationTrustAnchorControllerGetAll,
  federationTrustAnchorControllerGetById,
  federationTrustAnchorControllerUpdate,
  type CreateFederationTrustAnchorDto,
  type FederationTrustAnchorResponseDto,
  type UpdateFederationTrustAnchorDto,
} from '@eudiplo/sdk-core';
import { mutationOptions, queryOptions } from '@tanstack/angular-query-experimental';

type Instance = string | undefined;
type Tenant = string | null | undefined;

export const federationTrustAnchorsKey = (instance: Instance, tenant: Tenant) =>
  ['federation-trust-anchors', instance, tenant] as const;

/** The registered federation anchors in the signed-in tenant. */
export function federationTrustAnchorsQuery(instance: Instance, tenant: Tenant) {
  return queryOptions({
    queryKey: federationTrustAnchorsKey(instance, tenant),
    queryFn: async (): Promise<FederationTrustAnchorResponseDto[]> =>
      (await federationTrustAnchorControllerGetAll()).data ?? [],
    enabled: !!instance,
  });
}

/** A registered federation anchor (`GET /api/federation-trust-anchor/{id}`). */
export function federationTrustAnchorQuery(instance: Instance, tenant: Tenant, id: string) {
  return queryOptions({
    queryKey: [...federationTrustAnchorsKey(instance, tenant), id] as const,
    queryFn: async (): Promise<FederationTrustAnchorResponseDto> =>
      (await federationTrustAnchorControllerGetById({ path: { id } })).data,
    enabled: !!instance && !!id,
  });
}

export function createFederationTrustAnchorMutation() {
  return mutationOptions({
    mutationFn: async (
      body: CreateFederationTrustAnchorDto
    ): Promise<FederationTrustAnchorResponseDto> =>
      (await federationTrustAnchorControllerCreate({ body })).data,
  });
}

export function updateFederationTrustAnchorMutation() {
  return mutationOptions({
    mutationFn: async ({
      id,
      body,
    }: {
      id: string;
      body: UpdateFederationTrustAnchorDto;
    }): Promise<FederationTrustAnchorResponseDto> =>
      (await federationTrustAnchorControllerUpdate({ path: { id }, body })).data,
  });
}

export function deleteFederationTrustAnchorMutation() {
  return mutationOptions({
    mutationFn: async (id: string): Promise<void> => {
      await federationTrustAnchorControllerDelete({ path: { id } });
    },
  });
}
