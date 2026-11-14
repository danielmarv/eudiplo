import {
  defaultAccessKeyChainControllerGet,
  defaultAccessKeyChainControllerSet,
  keyChainControllerCreate,
  keyChainControllerCreateCsr,
  keyChainControllerDelete,
  keyChainControllerGetAll,
  keyChainControllerGetById,
  keyChainControllerGetProviders,
  keyChainControllerImport,
  keyChainControllerRotate,
  keyChainControllerUpdate,
  registrarControllerCreateAccessCertificate,
  registrarControllerCreateAccessKeyChain,
  type DefaultAccessKeyChainDto,
  type KeyChainCreateDto,
  type KeyChainImportDto,
  type KeyChainResponseDto,
  type KeyChainUpdateDto,
  type KmsProvidersResponseDto,
} from '@eudiplo/sdk-core';
import { mutationOptions, queryOptions } from '@tanstack/angular-query-experimental';

type Instance = string | undefined;
type Tenant = string | null | undefined;

export const keyChainsKey = (instance: Instance, tenant: Tenant) =>
  ['key-chains', instance, tenant] as const;

export const keyChainKey = (instance: Instance, tenant: Tenant, id: string) =>
  [...keyChainsKey(instance, tenant), id] as const;

/** Every signing key chain belonging to the current tenant. */
export function keyChainsQuery(instance: Instance, tenant: Tenant) {
  return queryOptions({
    queryKey: keyChainsKey(instance, tenant),
    queryFn: async (): Promise<KeyChainResponseDto[]> =>
      (await keyChainControllerGetAll()).data ?? [],
    enabled: !!instance,
    retry: false,
  });
}

/** One key chain; the response contains public key and certificate data, never private material. */
export function keyChainQuery(instance: Instance, tenant: Tenant, id: string) {
  return queryOptions({
    queryKey: keyChainKey(instance, tenant, id),
    queryFn: async (): Promise<KeyChainResponseDto> =>
      (await keyChainControllerGetById({ path: { id } })).data,
    enabled: !!instance && !!id,
    retry: false,
  });
}

const keyProvidersKey = (instance: Instance, tenant: Tenant) =>
  ['key-providers', instance, tenant] as const;

/** KMS capabilities determine which providers and signing algorithms can be selected. */
export function keyProvidersQuery(instance: Instance, tenant: Tenant) {
  return queryOptions({
    queryKey: keyProvidersKey(instance, tenant),
    queryFn: async (): Promise<KmsProvidersResponseDto> =>
      (await keyChainControllerGetProviders()).data,
    enabled: !!instance,
    retry: false,
  });
}

export const defaultAccessKeyChainKey = (instance: Instance, tenant: Tenant) =>
  ['default-access-key-chain', instance, tenant] as const;

export function defaultAccessKeyChainQuery(instance: Instance, tenant: Tenant) {
  return queryOptions({
    queryKey: defaultAccessKeyChainKey(instance, tenant),
    queryFn: async (): Promise<DefaultAccessKeyChainDto> =>
      (await defaultAccessKeyChainControllerGet()).data,
    enabled: !!instance,
    retry: false,
  });
}

export function createKeyChainMutation() {
  return mutationOptions({
    mutationFn: async (body: KeyChainCreateDto): Promise<{ id: string }> =>
      (await keyChainControllerCreate({ body })).data,
  });
}

export function importKeyChainMutation() {
  return mutationOptions({
    mutationFn: async (body: KeyChainImportDto): Promise<{ id: string }> =>
      (await keyChainControllerImport({ body })).data,
  });
}

export function updateKeyChainMutation() {
  return mutationOptions({
    mutationFn: async ({ id, body }: { id: string; body: KeyChainUpdateDto }): Promise<void> => {
      await keyChainControllerUpdate({ path: { id }, body });
    },
  });
}

export function deleteKeyChainMutation() {
  return mutationOptions({
    mutationFn: async (id: string): Promise<void> => {
      await keyChainControllerDelete({ path: { id } });
    },
  });
}

export function rotateKeyChainMutation() {
  return mutationOptions({
    mutationFn: async (id: string): Promise<void> => {
      await keyChainControllerRotate({ path: { id } });
    },
  });
}

export function setDefaultAccessKeyChainMutation() {
  return mutationOptions({
    mutationFn: async (id: string | null): Promise<DefaultAccessKeyChainDto> =>
      (
        await defaultAccessKeyChainControllerSet({
          body: { defaultAccessKeyChainId: id },
        })
      ).data,
  });
}

export function createCsrMutation() {
  return mutationOptions({
    mutationFn: async ({ id, subject }: { id: string; subject: string }): Promise<string> =>
      (
        await keyChainControllerCreateCsr({
          path: { id },
          query: subject ? { subject } : undefined,
        })
      ).data.csr,
  });
}

export function createRegistrarKeyMutation() {
  return mutationOptions({
    mutationFn: async ({
      description,
      kmsProvider,
    }: {
      description?: string;
      kmsProvider?: string;
    }): Promise<{ id: string }> => {
      const { certId } = (
        await registrarControllerCreateAccessKeyChain({
          body: { description, kmsProvider },
        })
      ).data;
      return { id: certId };
    },
  });
}

export function enrollKeyAtRegistrarMutation() {
  return mutationOptions({
    mutationFn: async (keyId: string): Promise<void> => {
      await registrarControllerCreateAccessCertificate({ body: { keyId } });
    },
  });
}
