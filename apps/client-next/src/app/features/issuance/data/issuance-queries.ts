import {
  attributeProviderControllerGetAll,
  credentialConfigControllerGetConfigs,
  credentialOfferControllerGetOffer,
  issuanceConfigControllerGetIssuanceConfigurations,
  issuanceConfigControllerReissueRegistrationCertificate,
  type IssuanceConfig,
  type OfferRequestDto,
  type OfferResponse,
  type Session,
  sessionControllerGetSession,
} from '@eudiplo/sdk-core';
import { mutationOptions, queryOptions } from '@tanstack/angular-query-experimental';

/**
 * The issuer's resources, per tenant. Each key starts with the resource and holds the instance
 * URL and the tenant, so signing in elsewhere never shows another one's data.
 */

/** The credentials the issuer can offer (`GET /api/issuer/credentials`). */
export function credentialConfigsQuery(
  instance: string | undefined,
  tenant: string | null | undefined,
  enabled = true
) {
  return queryOptions({
    queryKey: ['credential-configs', instance, tenant] as const,
    queryFn: async () => (await credentialConfigControllerGetConfigs()).data,
    enabled: !!instance && enabled,
  });
}

/** The issuer's settings, with its authorization servers (`GET /api/issuer/config`). */
export function issuanceConfigQuery(
  instance: string | undefined,
  tenant: string | null | undefined
) {
  return queryOptions({
    queryKey: ['issuance-config', instance, tenant] as const,
    queryFn: async () => (await issuanceConfigControllerGetIssuanceConfigurations()).data,
    enabled: !!instance,
  });
}

/**
 * Generates a new registration certificate at the registrar and revokes the one it replaces
 * (`POST /api/issuer/config/registration-cert/reissue`). Answers with the updated settings.
 */
export function reissueRegistrationCertificateMutation() {
  return mutationOptions({
    mutationFn: async (): Promise<IssuanceConfig> =>
      (await issuanceConfigControllerReissueRegistrationCertificate()).data,
  });
}

/** The services that resolve claims during issuance (`GET /api/issuer/attribute-providers`). */
export function attributeProvidersQuery(
  instance: string | undefined,
  tenant: string | null | undefined
) {
  return queryOptions({
    queryKey: ['attribute-providers', instance, tenant] as const,
    queryFn: async () => (await attributeProviderControllerGetAll()).data,
    enabled: !!instance,
  });
}

/** Creates a credential offer and its session (`POST /api/issuer/offer`). */
export function createOfferMutation() {
  return mutationOptions({
    mutationFn: async (body: OfferRequestDto): Promise<OfferResponse> =>
      (await credentialOfferControllerGetOffer({ body })).data,
  });
}

/** Statuses after which a session no longer changes. */
const DONE: readonly Session['status'][] = ['completed', 'expired', 'failed', 'cancelled'];

/**
 * One session (`GET /api/session/{id}`), checked every two seconds until the wallet has taken
 * the credential or the session ended otherwise.
 */
export function sessionQuery(
  instance: string | undefined,
  tenant: string | null | undefined,
  id: string | undefined
) {
  return queryOptions({
    queryKey: ['sessions', instance, tenant, id] as const,
    queryFn: async (): Promise<Session> =>
      (await sessionControllerGetSession({ path: { id: id! } })).data,
    enabled: !!instance && !!id,
    refetchInterval: (query) => (DONE.includes(query.state.data?.status as never) ? false : 2_000),
  });
}
