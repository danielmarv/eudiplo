import {
  type CreateStatusListDto,
  keyChainControllerGetAll,
  type KeyChainResponseDto,
  type StatusListConfig,
  statusListConfigControllerGetConfig,
  statusListConfigControllerResetConfig,
  statusListConfigControllerUpdateConfig,
  statusListManagementControllerCreateList,
  statusListManagementControllerDeleteList,
  statusListManagementControllerGetList,
  statusListManagementControllerGetLists,
  statusListManagementControllerUpdateList,
  type StatusListResponseDto,
  type UpdateStatusListDto,
} from '@eudiplo/sdk-core';
import { mutationOptions, queryOptions } from '@tanstack/angular-query-experimental';

/**
 * The tenant's status lists and their settings. Each key starts with the resource and holds the
 * instance URL and the tenant, so signing in elsewhere never shows another one's data.
 */

type Instance = string | undefined;
type Tenant = string | null | undefined;

export const statusListsKey = (instance: Instance, tenant: Tenant) =>
  ['status-lists', instance, tenant] as const;

export const statusListKey = (instance: Instance, tenant: Tenant, id: string) =>
  [...statusListsKey(instance, tenant), id] as const;

/** Every status list of the tenant (`GET /api/status-lists`). */
export function statusListsQuery(instance: Instance, tenant: Tenant) {
  return queryOptions({
    queryKey: statusListsKey(instance, tenant),
    queryFn: async (): Promise<StatusListResponseDto[]> =>
      (await statusListManagementControllerGetLists()).data ?? [],
    enabled: !!instance,
  });
}

/** One status list (`GET /api/status-lists/{listId}`). */
export function statusListQuery(instance: Instance, tenant: Tenant, id: string) {
  return queryOptions({
    queryKey: statusListKey(instance, tenant, id),
    queryFn: async (): Promise<StatusListResponseDto> =>
      (await statusListManagementControllerGetList({ path: { listId: id } })).data,
    enabled: !!instance && !!id,
  });
}

/** Creates a status list (`POST /api/status-lists`). */
export function createStatusListMutation() {
  return mutationOptions({
    mutationFn: async (body: CreateStatusListDto): Promise<StatusListResponseDto> =>
      (await statusListManagementControllerCreateList({ body })).data,
  });
}

/**
 * Changes what a status list is bound to (`PATCH /api/status-lists/{listId}`); `null` removes a
 * binding. A new key chain makes the backend sign the list again on its next request.
 */
export function updateStatusListMutation() {
  return mutationOptions({
    mutationFn: async ({
      id,
      body,
    }: {
      id: string;
      body: UpdateStatusListDto;
    }): Promise<StatusListResponseDto> =>
      (await statusListManagementControllerUpdateList({ path: { listId: id }, body })).data,
  });
}

/** Deletes a status list that no credential uses (`DELETE /api/status-lists/{listId}`). */
export function deleteStatusListMutation() {
  return mutationOptions({
    mutationFn: async (id: string): Promise<void> => {
      await statusListManagementControllerDeleteList({ path: { listId: id } });
    },
  });
}

export const statusListConfigKey = (instance: Instance, tenant: Tenant) =>
  ['status-list-config', instance, tenant] as const;

/**
 * The status list settings the tenant stores itself (`GET /api/status-list-config`); `{}` when it
 * stores none, so the instance's defaults apply.
 */
export function statusListConfigQuery(instance: Instance, tenant: Tenant) {
  return queryOptions({
    queryKey: statusListConfigKey(instance, tenant),
    queryFn: async (): Promise<StatusListConfig> =>
      // Without settings the backend answers an empty body without a Content-Type.
      (await statusListConfigControllerGetConfig({ parseAs: 'json' })).data ?? {},
    enabled: !!instance,
  });
}

/** Replaces the stored settings (`PUT /api/status-list-config`); what is left out follows the instance. */
export function saveStatusListConfigMutation() {
  return mutationOptions({
    mutationFn: async (body: StatusListConfig): Promise<StatusListConfig> =>
      (await statusListConfigControllerUpdateConfig({ body })).data,
  });
}

/** Removes the stored settings (`DELETE /api/status-list-config`), so the instance's apply. */
export function resetStatusListConfigMutation() {
  return mutationOptions({
    mutationFn: async (): Promise<void> => {
      await statusListConfigControllerResetConfig();
    },
  });
}

/**
 * The key chains that can sign a status list (`GET /api/key-chain`): those for status lists and,
 * as the backend falls back to them, those for attestations.
 */
export function signingKeyChainsQuery(instance: Instance, tenant: Tenant) {
  return queryOptions({
    queryKey: ['key-chains', instance, tenant] as const,
    queryFn: async (): Promise<KeyChainResponseDto[]> =>
      (await keyChainControllerGetAll()).data ?? [],
    select: (chains: KeyChainResponseDto[]) =>
      chains.filter(
        (chain) => chain.usageType === 'statusList' || chain.usageType === 'attestation'
      ),
    enabled: !!instance,
  });
}
