import {
  configPortabilityControllerResourcesOfKind,
  type ConfigResourceOwnershipDto,
} from '@eudiplo/sdk-core';
import { queryOptions } from '@tanstack/angular-query-experimental';

export type ConfigResourceKind = ConfigResourceOwnershipDto['kind'];
export type ConfigOwnership = ConfigResourceOwnershipDto;

/** How long a lookup may take before the page goes on without it. */
const LOOKUP_TIMEOUT_MS = 10_000;

/**
 * Who owns the resources of one kind (`GET /api/config-bundles/resources/{kind}`): a resource that a
 * configuration file or bundle provisioned is `file-managed` and read-only in the Web Client.
 * Readable with any role that manages the kind. When the lookup fails, nothing is locked: the
 * backend refuses a change it does not allow anyway.
 */
export function configOwnershipQuery(
  instance: string | undefined,
  tenant: string | null | undefined,
  kind: ConfigResourceKind,
  enabled = true
) {
  return queryOptions({
    queryKey: ['config-ownership', instance, tenant, kind] as const,
    queryFn: async ({ signal }) =>
      (
        await configPortabilityControllerResourcesOfKind({
          path: { kind },
          signal: AbortSignal.any([signal, AbortSignal.timeout(LOOKUP_TIMEOUT_MS)]),
        })
      ).data,
    enabled: !!instance && enabled,
    retry: false,
  });
}

/** The file-managed resources of a lookup, by ID. */
export function fileManaged(
  resources: readonly ConfigOwnership[] | undefined
): Map<string, ConfigOwnership> {
  return new Map(
    (resources ?? [])
      .filter((resource) => resource.ownership === 'file-managed')
      .map((resource) => [resource.resourceId, resource])
  );
}

/**
 * Whether Config Portability offers "Reset to file" for the resource, which applies its version
 * from the config folder again. A resource from an uploaded bundle has no folder version. Most
 * tenants change their settings and default key chains through the API, so these offer it only
 * once detached from a folder.
 */
export function offersResetToFile(
  kind: ConfigResourceKind,
  resource: Pick<ConfigOwnership, 'ownership' | 'source'> | undefined
): boolean {
  if (!resource || resource.ownership === 'file-managed') return false;
  if (resource.source?.startsWith('bundle:')) return false;
  return (kind !== 'Tenant' && kind !== 'KeyChainDefaults') || resource.ownership === 'detached';
}

/**
 * Whether Config Portability offers "Apply from file" for the resource: a client from the config
 * folder, whose file can ask for a new secret with `"secret": "!generate"`.
 */
export function offersApplyFromFile(
  kind: ConfigResourceKind,
  resource: Pick<ConfigOwnership, 'ownership' | 'source'> | undefined
): boolean {
  return (
    kind === 'Client' &&
    resource?.ownership === 'file-managed' &&
    !!resource.source?.startsWith('folder:')
  );
}

/** Why a file-managed resource cannot be changed here, naming its file or bundle. */
export function lockReason(resource: Pick<ConfigOwnership, 'source'>): string {
  return `Managed by ${resource.source || 'a configuration bundle'}, read-only`;
}
