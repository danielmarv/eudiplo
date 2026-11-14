import {
  keyChainControllerGetAll,
  trustListControllerCreateTrustList,
  trustListControllerDeleteTrustList,
  trustListControllerGetAllTrustLists,
  trustListControllerGetTrustList,
  trustListControllerGetTrustListVersions,
  trustListControllerUpdateTrustList,
  type KeyChainResponseDto,
  type TrustList,
  type TrustListCreateDto,
  type TrustListVersion,
} from '@eudiplo/sdk-core';
import { mutationOptions, queryOptions } from '@tanstack/angular-query-experimental';

type Instance = string | undefined;
type Tenant = string | null | undefined;

/** The tenant's trust lists, keyed by instance and tenant so another sign-in cannot reuse them. */
export const trustListsKey = (instance: Instance, tenant: Tenant) =>
  ['trust-lists', instance, tenant] as const;

export const trustListKey = (instance: Instance, tenant: Tenant, id: string) =>
  [...trustListsKey(instance, tenant), id] as const;

export function trustListsQuery(instance: Instance, tenant: Tenant) {
  return queryOptions({
    queryKey: trustListsKey(instance, tenant),
    queryFn: async (): Promise<TrustList[]> =>
      (await trustListControllerGetAllTrustLists()).data ?? [],
    enabled: !!instance,
  });
}

export function trustListQuery(instance: Instance, tenant: Tenant, id: string) {
  return queryOptions({
    queryKey: trustListKey(instance, tenant, id),
    queryFn: async (): Promise<TrustList> =>
      (await trustListControllerGetTrustList({ path: { id } })).data,
    enabled: !!instance && !!id,
  });
}

export function trustListVersionsQuery(
  instance: Instance,
  tenant: Tenant,
  id: string,
  enabled = true
) {
  return queryOptions({
    queryKey: [...trustListKey(instance, tenant, id), 'versions'] as const,
    queryFn: async (): Promise<TrustListVersion[]> =>
      (await trustListControllerGetTrustListVersions({ path: { id } })).data ?? [],
    enabled: !!instance && !!id && enabled,
    retry: false,
  });
}

export function trustListKeyChainsQuery(instance: Instance, tenant: Tenant) {
  return queryOptions({
    queryKey: ['key-chains', instance, tenant] as const,
    queryFn: async (): Promise<KeyChainResponseDto[]> =>
      (await keyChainControllerGetAll({})).data ?? [],
    enabled: !!instance,
  });
}

export function createTrustListMutation() {
  return mutationOptions({
    mutationFn: async (body: TrustListCreateDto): Promise<TrustList> =>
      (await trustListControllerCreateTrustList({ body })).data,
  });
}

export function updateTrustListMutation() {
  return mutationOptions({
    mutationFn: async ({
      id,
      body,
    }: {
      id: string;
      body: TrustListCreateDto;
    }): Promise<TrustList> =>
      (await trustListControllerUpdateTrustList({ path: { id }, body })).data,
  });
}

export function deleteTrustListMutation() {
  return mutationOptions({
    mutationFn: async (id: string): Promise<void> => {
      await trustListControllerDeleteTrustList({ path: { id } });
    },
  });
}
