import {
  type CredentialConfig,
  type CredentialConfigCreate,
  credentialConfigControllerDeleteIssuanceConfiguration,
  credentialConfigControllerGetConfigById,
  credentialConfigControllerStoreCredentialConfiguration,
  credentialConfigControllerUpdateCredentialConfiguration,
  type CredentialConfigUpdate,
} from '@eudiplo/sdk-core';
import { mutationOptions, queryOptions } from '@tanstack/angular-query-experimental';

type Instance = string | undefined;
type Tenant = string | null | undefined;

/** The key every credential type query starts with, as `credentialConfigsQuery` uses it. */
export const credentialConfigsKey = (instance: Instance, tenant: Tenant) =>
  ['credential-configs', instance, tenant] as const;

/** One credential type (`GET /api/issuer/credentials/{id}`). */
export function credentialConfigQuery(instance: Instance, tenant: Tenant, id: string) {
  return queryOptions({
    queryKey: [...credentialConfigsKey(instance, tenant), id] as const,
    queryFn: async (): Promise<CredentialConfig> =>
      (await credentialConfigControllerGetConfigById({ path: { id } })).data,
    enabled: !!instance && !!id,
  });
}

export function createCredentialConfigMutation() {
  return mutationOptions({
    mutationFn: async (body: CredentialConfigCreate): Promise<unknown> =>
      (await credentialConfigControllerStoreCredentialConfiguration({ body })).data,
  });
}

export function updateCredentialConfigMutation() {
  return mutationOptions({
    mutationFn: async ({
      id,
      body,
    }: {
      id: string;
      body: CredentialConfigUpdate;
    }): Promise<unknown> =>
      (await credentialConfigControllerUpdateCredentialConfiguration({ path: { id }, body })).data,
  });
}

export function deleteCredentialConfigMutation() {
  return mutationOptions({
    mutationFn: async (id: string): Promise<void> => {
      await credentialConfigControllerDeleteIssuanceConfiguration({ path: { id } });
    },
  });
}
