import {
  type CreateWebhookEndpointDto,
  type UpdateWebhookEndpointDto,
  webhookEndpointControllerCreate,
  webhookEndpointControllerDelete,
  webhookEndpointControllerGetAll,
  webhookEndpointControllerGetById,
  webhookEndpointControllerUpdate,
  type WebhookEndpointEntity,
} from '@eudiplo/sdk-core';
import { mutationOptions, queryOptions } from '@tanstack/angular-query-experimental';

/**
 * The tenant's webhook endpoints, which receive the result of presentations and the wallet unit
 * revocations of credentials. One endpoint's key is under the list's.
 */

type Instance = string | undefined;
type Tenant = string | null | undefined;

export const webhookEndpointsKey = (instance: Instance, tenant: Tenant) =>
  ['webhook-endpoints', instance, tenant] as const;

/** Every webhook endpoint of the tenant (`GET /api/issuer/webhook-endpoints`); keys are redacted. */
export function webhookEndpointsQuery(instance: Instance, tenant: Tenant) {
  return queryOptions({
    queryKey: webhookEndpointsKey(instance, tenant),
    queryFn: async (): Promise<WebhookEndpointEntity[]> =>
      (await webhookEndpointControllerGetAll()).data ?? [],
    enabled: !!instance,
  });
}

/** One webhook endpoint (`GET /api/issuer/webhook-endpoints/{id}`); its key is never returned. */
export function webhookEndpointQuery(instance: Instance, tenant: Tenant, id: string) {
  return queryOptions({
    queryKey: [...webhookEndpointsKey(instance, tenant), id] as const,
    queryFn: async (): Promise<WebhookEndpointEntity> =>
      (await webhookEndpointControllerGetById({ path: { id } })).data,
    enabled: !!instance && !!id,
  });
}

/** Registers a webhook endpoint (`POST /api/issuer/webhook-endpoints`). */
export function createWebhookEndpointMutation() {
  return mutationOptions({
    mutationFn: async (body: CreateWebhookEndpointDto): Promise<WebhookEndpointEntity> =>
      (await webhookEndpointControllerCreate({ body })).data,
  });
}

/** Changes a webhook endpoint (`PATCH /api/issuer/webhook-endpoints/{id}`). */
export function updateWebhookEndpointMutation() {
  return mutationOptions({
    mutationFn: async ({
      id,
      body,
    }: {
      id: string;
      body: UpdateWebhookEndpointDto;
    }): Promise<WebhookEndpointEntity> =>
      (await webhookEndpointControllerUpdate({ path: { id }, body })).data,
  });
}

/** Deletes a webhook endpoint (`DELETE /api/issuer/webhook-endpoints/{id}`). */
export function deleteWebhookEndpointMutation() {
  return mutationOptions({
    mutationFn: async (id: string): Promise<void> => {
      await webhookEndpointControllerDelete({ path: { id } });
    },
  });
}
