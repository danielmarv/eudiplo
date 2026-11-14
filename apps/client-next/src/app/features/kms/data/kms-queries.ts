import {
  keyChainControllerDeleteTenantKmsConfig,
  keyChainControllerGetProviders,
  keyChainControllerGetProvidersHealth,
  keyChainControllerGetTenantKmsConfig,
  keyChainControllerUpdateTenantKmsConfig,
  type KmsConfigDto,
  type KmsTenantConfigResponseDto,
} from '@eudiplo/sdk-core';
import { mutationOptions, queryOptions } from '@tanstack/angular-query-experimental';

type Instance = string | undefined;
type Tenant = string | null | undefined;

export const kmsProvidersKey = (instance: Instance, tenant: Tenant) =>
  ['kms-providers', instance, tenant] as const;

/** Providers and their runtime health, as shown together on the KMS page. */
export function kmsProvidersQuery(instance: Instance, tenant: Tenant) {
  return queryOptions({
    queryKey: kmsProvidersKey(instance, tenant),
    queryFn: async () => {
      const [providers, health] = await Promise.all([
        keyChainControllerGetProviders(),
        keyChainControllerGetProvidersHealth(),
      ]);
      return { ...providers.data, health: health.data ?? [] };
    },
    enabled: !!instance,
    retry: false,
  });
}

export const tenantKmsConfigKey = (instance: Instance, tenant: Tenant) =>
  ['tenant-kms-config', instance, tenant] as const;

/** The current tenant's own KMS configuration; never fetched for key managers without admin rights. */
export function tenantKmsConfigQuery(instance: Instance, tenant: Tenant, enabled: boolean) {
  return queryOptions({
    queryKey: tenantKmsConfigKey(instance, tenant),
    queryFn: async (): Promise<KmsTenantConfigResponseDto> =>
      (await keyChainControllerGetTenantKmsConfig()).data,
    enabled: !!instance && enabled,
    retry: false,
  });
}

export function saveTenantKmsConfigMutation() {
  return mutationOptions({
    mutationFn: async (body: KmsConfigDto): Promise<KmsTenantConfigResponseDto> =>
      (await keyChainControllerUpdateTenantKmsConfig({ body })).data,
  });
}

export function resetTenantKmsConfigMutation() {
  return mutationOptions({
    mutationFn: async (): Promise<void> => {
      await keyChainControllerDeleteTenantKmsConfig();
    },
  });
}
