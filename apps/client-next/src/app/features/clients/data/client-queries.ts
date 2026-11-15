import {
  type ClientEntity,
  clientControllerCreateClient,
  clientControllerDeleteClient,
  clientControllerGetClient,
  clientControllerGetClients,
  clientControllerRotateClientSecret,
  clientControllerUpdateClient,
  type CreateClientDto,
  type UpdateClientDto,
} from '@eudiplo/sdk-core';
import { mutationOptions, queryOptions } from '@tanstack/angular-query-experimental';

/**
 * The tenant's API clients. The backend answers 501 when the identity provider manages them, as
 * with `generic` sign-in. A secret is shown only once, by create and rotate.
 */

type Instance = string | undefined;
type Tenant = string | null | undefined;

export const clientsKey = (instance: Instance, tenant: Tenant) =>
  ['clients', instance, tenant] as const;

/** The tenant's clients (`GET /api/client`). */
export function clientsQuery(instance: Instance, tenant: Tenant) {
  return queryOptions({
    queryKey: clientsKey(instance, tenant),
    queryFn: async (): Promise<ClientEntity[]> => (await clientControllerGetClients()).data ?? [],
    enabled: !!instance,
  });
}

/** One client (`GET /api/client/{id}`). */
export function clientQuery(instance: Instance, tenant: Tenant, id: string) {
  return queryOptions({
    queryKey: [...clientsKey(instance, tenant), id] as const,
    queryFn: async (): Promise<ClientEntity> =>
      (await clientControllerGetClient({ path: { id } })).data,
    enabled: !!instance && !!id,
  });
}

/** A new client with the secret the backend generated, which it never returns again. */
export type CreatedClient = ClientEntity & { clientSecret?: string };

export function createClientMutation() {
  return mutationOptions({
    mutationFn: async (body: CreateClientDto): Promise<CreatedClient> =>
      (await clientControllerCreateClient({ body })).data as CreatedClient,
  });
}

export function updateClientMutation() {
  return mutationOptions({
    mutationFn: async ({
      id,
      body,
    }: {
      id: string;
      body: UpdateClientDto;
    }): Promise<ClientEntity> =>
      (await clientControllerUpdateClient({ path: { id }, body })).data as ClientEntity,
  });
}

export function deleteClientMutation() {
  return mutationOptions({
    mutationFn: async (id: string): Promise<void> => {
      await clientControllerDeleteClient({ path: { id } });
    },
  });
}

/** Replaces a client's secret; the old one and its tokens stop working at once. */
export function rotateSecretMutation() {
  return mutationOptions({
    mutationFn: async (id: string): Promise<string> =>
      (await clientControllerRotateClientSecret({ path: { id } })).data.secret,
  });
}
