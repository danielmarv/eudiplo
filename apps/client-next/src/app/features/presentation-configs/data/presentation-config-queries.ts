import {
  federationTrustAnchorControllerGetAll,
  type FederationTrustAnchorResponseDto,
  keyChainControllerGetAll,
  defaultAccessKeyChainControllerGet,
  presentationManagementControllerResolveIssuerMetadata,
  presentationManagementControllerResolveSchemaMetadata,
  presentationManagementControllerResolveSchemaMetadataJwt,
  presentationManagementControllerListSchemaMetadataCatalog,
  type CredentialIssuerMetadataDto,
  type DefaultAccessKeyChainDto,
  type KeyChainResponseDto,
  type PresentationConfig,
  type PresentationConfigCreateDto,
  type PresentationConfigUpdateDto,
  type ResolveSchemaMetadataDto,
  type ResolveIssuerMetadataDto,
  type ResolveSchemaMetadataJwtDto,
  type ResolvedSchemaMetadataResponseDto,
  type SchemaMetadataResponseDto,
  presentationManagementControllerConfiguration,
  presentationManagementControllerDeleteConfiguration,
  presentationManagementControllerGetConfiguration,
  presentationManagementControllerReissueRegistrationCertificate,
  presentationManagementControllerStorePresentationConfig,
  presentationManagementControllerUpdateConfiguration,
  type TrustList,
  trustListControllerGetAllTrustLists,
} from '@eudiplo/sdk-core';
import { mutationOptions, queryOptions } from '@tanstack/angular-query-experimental';

/**
 * The tenant's presentation configurations and what they refer to. Each key starts with the
 * resource and holds the instance URL and the tenant, so signing in elsewhere never shows another
 * one's data.
 */

type Instance = string | undefined;
type Tenant = string | null | undefined;

export const presentationConfigsKey = (instance: Instance, tenant: Tenant) =>
  ['presentation-configs', instance, tenant] as const;

/** The presentation configurations (`GET /api/verifier/config`). */
export function presentationConfigsQuery(instance: Instance, tenant: Tenant) {
  return queryOptions({
    queryKey: presentationConfigsKey(instance, tenant),
    queryFn: async (): Promise<PresentationConfig[]> =>
      (await presentationManagementControllerConfiguration()).data ?? [],
    enabled: !!instance,
  });
}

/** One presentation configuration (`GET /api/verifier/config/{id}`). */
export function presentationConfigQuery(instance: Instance, tenant: Tenant, id: string) {
  return queryOptions({
    queryKey: [...presentationConfigsKey(instance, tenant), id] as const,
    queryFn: async (): Promise<PresentationConfig> =>
      (await presentationManagementControllerGetConfiguration({ path: { id } })).data,
    enabled: !!instance && !!id,
  });
}

/** Creates a presentation configuration (`POST /api/verifier/config`). */
export function createPresentationConfigMutation() {
  return mutationOptions({
    mutationFn: async (body: PresentationConfigCreateDto): Promise<PresentationConfig> =>
      (await presentationManagementControllerStorePresentationConfig({ body })).data,
  });
}

/** Changes a presentation configuration (`PATCH /api/verifier/config/{id}`); `null` clears a field. */
export function updatePresentationConfigMutation() {
  return mutationOptions({
    mutationFn: async ({
      id,
      body,
    }: {
      id: string;
      body: PresentationConfigUpdateDto;
    }): Promise<PresentationConfig> =>
      (await presentationManagementControllerUpdateConfiguration({ path: { id }, body })).data,
  });
}

/** Deletes a presentation configuration (`DELETE /api/verifier/config/{id}`). */
export function deletePresentationConfigMutation() {
  return mutationOptions({
    mutationFn: async (id: string): Promise<void> => {
      await presentationManagementControllerDeleteConfiguration({ path: { id } });
    },
  });
}

/**
 * Resolves the registration certificate again (`POST /api/verifier/config/{id}/registration-cert/reissue`):
 * an imported JWT is checked again, a registrar ID or body is requested from the registrar.
 */
export function reissueRegistrationCertMutation() {
  return mutationOptions({
    mutationFn: async (id: string): Promise<PresentationConfig> =>
      (await presentationManagementControllerReissueRegistrationCertificate({ path: { id } })).data,
  });
}

/** The trust lists the tenant manages (`GET /api/trust-list`). */
export function trustListsQuery(instance: Instance, tenant: Tenant, enabled = true) {
  return queryOptions({
    queryKey: ['trust-lists', instance, tenant] as const,
    queryFn: async (): Promise<TrustList[]> =>
      (await trustListControllerGetAllTrustLists()).data ?? [],
    enabled: !!instance && enabled,
  });
}

/** The OpenID Federation trust anchors (`GET /api/federation-trust-anchor`). */
export function federationAnchorsQuery(instance: Instance, tenant: Tenant, enabled = true) {
  return queryOptions({
    queryKey: ['federation-trust-anchors', instance, tenant] as const,
    queryFn: async (): Promise<FederationTrustAnchorResponseDto[]> =>
      (await federationTrustAnchorControllerGetAll()).data ?? [],
    enabled: !!instance && enabled,
  });
}

/** Access key chains available for signing presentation requests. */
export function presentationKeyChainsQuery(instance: Instance, tenant: Tenant) {
  return queryOptions({
    queryKey: ['key-chains', instance, tenant] as const,
    queryFn: async (): Promise<KeyChainResponseDto[]> =>
      ((await keyChainControllerGetAll()).data ?? []).filter(
        (chain) => chain.usageType === 'access'
      ),
    enabled: !!instance,
  });
}

/** The key chain used when a presentation config does not select one. */
export function defaultAccessKeyChainQuery(instance: Instance, tenant: Tenant) {
  return queryOptions({
    queryKey: ['default-access-key-chain', instance, tenant] as const,
    queryFn: async (): Promise<DefaultAccessKeyChainDto> =>
      (await defaultAccessKeyChainControllerGet()).data ?? {},
    enabled: !!instance,
    retry: false,
  });
}

/** Resolves credential issuer metadata through the backend proxy. */
export function resolveIssuerMetadataMutation() {
  return mutationOptions({
    mutationFn: async (body: ResolveIssuerMetadataDto): Promise<CredentialIssuerMetadataDto> =>
      (await presentationManagementControllerResolveIssuerMetadata({ body })).data,
  });
}

/** Resolves schema metadata through the backend proxy. */
export function resolveSchemaMetadataMutation() {
  return mutationOptions({
    mutationFn: async (
      body: ResolveSchemaMetadataDto
    ): Promise<ResolvedSchemaMetadataResponseDto> =>
      (await presentationManagementControllerResolveSchemaMetadata({ body })).data,
  });
}

/** Resolves a signed schema catalog entry. */
export function resolveSchemaMetadataJwtMutation() {
  return mutationOptions({
    mutationFn: async (
      body: ResolveSchemaMetadataJwtDto
    ): Promise<ResolvedSchemaMetadataResponseDto> =>
      (await presentationManagementControllerResolveSchemaMetadataJwt({ body })).data,
  });
}

/** Published schema metadata available from the registrar. */
export function schemaMetadataCatalogQuery(instance: Instance, tenant: Tenant) {
  return queryOptions({
    queryKey: ['presentation-schema-catalog', instance, tenant] as const,
    queryFn: async (): Promise<SchemaMetadataResponseDto[]> =>
      (await presentationManagementControllerListSchemaMetadataCatalog()).data ?? [],
    enabled: !!instance,
  });
}
