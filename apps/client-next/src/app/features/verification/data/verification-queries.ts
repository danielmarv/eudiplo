import {
  type DefaultAccessKeyChainDto,
  defaultAccessKeyChainControllerGet,
  keyChainControllerGetAll,
  type KeyChainResponseDto,
  type OfferResponse,
  type PresentationConfig,
  presentationManagementControllerConfiguration,
  type PresentationRequest,
  verifierOfferControllerGetOffer,
} from '@eudiplo/sdk-core';
import { mutationOptions, queryOptions } from '@tanstack/angular-query-experimental';

/**
 * What a verification request needs, per tenant. Each key starts with the resource and holds the
 * instance URL and the tenant, so signing in elsewhere never shows another one's data.
 */

type Instance = string | undefined;
type Tenant = string | null | undefined;

/** The presentation configurations (`GET /api/verifier/config`). */
export function presentationConfigsQuery(instance: Instance, tenant: Tenant) {
  return queryOptions({
    queryKey: ['presentation-configs', instance, tenant] as const,
    queryFn: async (): Promise<PresentationConfig[]> =>
      (await presentationManagementControllerConfiguration()).data ?? [],
    enabled: !!instance,
  });
}

/** The tenant's key chains (`GET /api/key-chain`); readable with a manage role. */
export function keyChainsQuery(instance: Instance, tenant: Tenant, enabled = true) {
  return queryOptions({
    queryKey: ['key-chains', instance, tenant] as const,
    queryFn: async (): Promise<KeyChainResponseDto[]> =>
      (await keyChainControllerGetAll()).data ?? [],
    enabled: !!instance && enabled,
  });
}

/** The access key chain requests use when their configuration names none (`GET /api/key-chain/access/default`). */
export function defaultAccessKeyChainQuery(instance: Instance, tenant: Tenant, enabled = true) {
  return queryOptions({
    queryKey: ['default-access-key-chain', instance, tenant] as const,
    queryFn: async (): Promise<DefaultAccessKeyChainDto> =>
      (await defaultAccessKeyChainControllerGet()).data ?? {},
    enabled: !!instance && enabled,
    retry: false,
  });
}

/** Creates a presentation request and its session (`POST /api/verifier/offer`). */
export function createPresentationRequestMutation() {
  return mutationOptions({
    mutationFn: async (body: PresentationRequest): Promise<OfferResponse> =>
      (await verifierOfferControllerGetOffer({ body })).data,
  });
}
