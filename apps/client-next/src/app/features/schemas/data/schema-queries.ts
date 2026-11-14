import {
  type DeprecateSchemaMetadataDto,
  type PublishSchemaMetaConfig,
  schemaMetadataControllerDeprecateVersion,
  schemaMetadataControllerFindAll,
  schemaMetadataControllerFindOne,
  schemaMetadataControllerGetJwt,
  schemaMetadataControllerGetMine,
  schemaMetadataControllerGetVersions,
  schemaMetadataControllerGetVocabularies,
  schemaMetadataControllerPublishSchemaMetadata,
  schemaMetadataControllerPublishSchemaMetadataVersion,
  schemaMetadataControllerRemove,
  schemaMetadataControllerUpdate,
  type SchemaMetadataResponseDto,
  type SchemaMetadataVocabulariesDto,
  type UpdateSchemaMetadataDto,
} from '@eudiplo/sdk-core';
import { mutationOptions, queryOptions } from '@tanstack/angular-query-experimental';

/**
 * The tenant's schema metadata at the registrar: one entry per schema version, signed by the
 * tenant's access certificate. Every call goes through the backend to the registrar.
 */

type Instance = string | undefined;
type Tenant = string | null | undefined;
export type SchemaEntry = SchemaMetadataResponseDto;

export const schemasKey = (instance: Instance, tenant: Tenant) =>
  ['schemas', instance, tenant] as const;

/** Every version this tenant published (`GET /api/schema-metadata/mine`). */
export function mySchemasQuery(instance: Instance, tenant: Tenant) {
  return queryOptions({
    queryKey: schemasKey(instance, tenant),
    queryFn: async (): Promise<SchemaEntry[]> =>
      (await schemaMetadataControllerGetMine()).data ?? [],
    enabled: !!instance,
  });
}

/**
 * One version of a schema; the latest without `version`. A version that does not exist falls
 * back to the latest, and `missing` says so.
 */
export function schemaVersionQuery(
  instance: Instance,
  tenant: Tenant,
  id: string,
  version: string | undefined
) {
  return queryOptions({
    queryKey: [...schemasKey(instance, tenant), id, 'version', version ?? 'latest'] as const,
    queryFn: async (): Promise<{ entry: SchemaEntry; missing: boolean }> => {
      if (version) {
        const found = (
          await schemaMetadataControllerFindAll({ query: { attestationId: id, version } })
        ).data?.[0];
        if (found) return { entry: found, missing: false };
      }
      const latest = (await schemaMetadataControllerFindOne({ path: { id } })).data;
      return { entry: latest, missing: !!version };
    },
    enabled: !!instance && !!id,
  });
}

/** The versions of a schema (`GET /api/schema-metadata/{id}/versions`). */
export function schemaVersionsQuery(instance: Instance, tenant: Tenant, id: string) {
  return queryOptions({
    queryKey: [...schemasKey(instance, tenant), id, 'versions'] as const,
    queryFn: async (): Promise<SchemaEntry[]> =>
      (await schemaMetadataControllerGetVersions({ path: { id } })).data ?? [],
    enabled: !!instance && !!id,
  });
}

/** The registrar's category and tag vocabularies, with empty lists for missing ones. */
export function vocabulariesQuery(instance: Instance, tenant: Tenant) {
  return queryOptions({
    queryKey: ['schema-vocabularies', instance, tenant] as const,
    queryFn: async (): Promise<SchemaMetadataVocabulariesDto> => {
      const data = (await schemaMetadataControllerGetVocabularies()).data as
        Partial<SchemaMetadataVocabulariesDto> | undefined;
      return {
        version: data?.version ?? '',
        categories: Array.isArray(data?.categories) ? data.categories : [],
        tags: Array.isArray(data?.tags) ? data.tags : [],
      };
    },
    enabled: !!instance,
    staleTime: 60 * 60_000,
  });
}

/** The signed JWT of a version, as the registrar serves it. */
export async function signedJwt(id: string, version: string): Promise<string> {
  return (await schemaMetadataControllerGetJwt({ path: { id, version } })).data as string;
}

interface PublishOptions {
  /** The credential type the schema describes, which the backend links to it. */
  credentialConfigId?: string;
}

/**
 * Reserves an attestation ID at the registrar and publishes the first version
 * (`POST /api/schema-metadata/publish`). Needs `issuance:manage` besides `registrar:manage`.
 */
export function publishSchemaMutation() {
  return mutationOptions({
    mutationFn: async ({
      config,
      credentialConfigId,
    }: { config: Omit<PublishSchemaMetaConfig, 'id'> } & PublishOptions): Promise<SchemaEntry> =>
      (
        await schemaMetadataControllerPublishSchemaMetadata({
          body: { config, ...(credentialConfigId ? { credentialConfigId } : {}) },
        })
      ).data,
  });
}

/** Publishes a new version of a schema (`POST /api/schema-metadata/publish-version`). */
export function publishVersionMutation() {
  return mutationOptions({
    mutationFn: async (config: PublishSchemaMetaConfig): Promise<SchemaEntry> =>
      (await schemaMetadataControllerPublishSchemaMetadataVersion({ body: { config } })).data,
  });
}

/** Changes the catalog metadata of a version (`PATCH .../versions/{version}`). */
export function updateSchemaMetadataMutation() {
  return mutationOptions({
    mutationFn: async ({
      id,
      version,
      body,
    }: {
      id: string;
      version: string;
      body: UpdateSchemaMetadataDto;
    }): Promise<SchemaEntry> =>
      (await schemaMetadataControllerUpdate({ path: { id, version }, body })).data,
  });
}

/** Deprecates a version (`PATCH .../versions/{version}/deprecation`). */
export function deprecateVersionMutation() {
  return mutationOptions({
    mutationFn: async ({
      id,
      version,
      body,
    }: {
      id: string;
      version: string;
      body: DeprecateSchemaMetadataDto;
    }): Promise<SchemaEntry> =>
      (await schemaMetadataControllerDeprecateVersion({ path: { id, version }, body })).data,
  });
}

/** Deletes a version at the registrar (`DELETE .../versions/{version}`). */
export function deleteVersionMutation() {
  return mutationOptions({
    mutationFn: async ({ id, version }: { id: string; version: string }): Promise<void> => {
      await schemaMetadataControllerRemove({ path: { id, version } });
    },
  });
}
