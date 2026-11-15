import {
  type ConfigImportRunEntity,
  configPortabilityControllerDetach,
  configPortabilityControllerExport,
  configPortabilityControllerImport,
  configPortabilityControllerImportArchive,
  configPortabilityControllerOperations,
  configPortabilityControllerPlan,
  configPortabilityControllerPlanArchive,
  configPortabilityControllerPlanReattach,
  configPortabilityControllerReattach,
  configPortabilityControllerResources,
  type ConfigResourceMetadataEntity,
} from '@eudiplo/sdk-core';
import { queryOptions } from '@tanstack/angular-query-experimental';
import type { ConfigResourceKind } from '../../../shared/config-ownership/config-ownership';

/**
 * Configuration as code for the tenant (`/api/config-bundles`): export, a read-only plan before
 * every import, the import itself, and who owns each resource. Planning, importing and the
 * resource list need `tenant:admin` or `tenants:manage`. The SDK types the bundle endpoints
 * loosely, so the shapes below follow the backend's responses.
 */

type Instance = string | undefined;
type Tenant = string | null | undefined;

export type ImportMode = 'create' | 'upsert' | 'replace';
export type Resource = ConfigResourceMetadataEntity;
export type Operation = ConfigImportRunEntity;

/** A configuration bundle as the export writes it and the import reads it. */
export interface ConfigBundle {
  manifest: { format: string; formatVersion?: number; tenant?: string; [key: string]: unknown };
  documents: unknown[];
  assets?: unknown[];
}

interface PlanIssue {
  severity: 'warning' | 'required-input' | 'error';
  code: string;
  path: string;
  message: string;
}

/**
 * One field a plan changes. A missing `before` is a value the import adds, a missing `after` one
 * it removes. With `redacted`, a secret reads `[redacted]`, and an object or list whose content is
 * not shown reads `[changed]`.
 */
export interface PlanChange {
  path: string;
  before?: unknown;
  after?: unknown;
  redacted?: boolean;
}

export interface PlanItem {
  kind: string;
  id: string;
  action: 'create' | 'update' | 'unchanged' | 'skip' | 'delete' | 'blocked';
  sourceVersion: string;
  targetVersion: string;
  migrations: string[];
  issues: PlanIssue[];
  changes?: PlanChange[];
}

/** A secret an apply generated for a client, shown once. */
export interface GeneratedSecret {
  kind: 'Client';
  id: string;
  path: string;
  value: string;
}

export interface ImportPlan {
  tenantId: string;
  mode: ImportMode;
  applicable: boolean;
  items: PlanItem[];
  issues: PlanIssue[];
  planFingerprint?: string;
  /** Set once the plan was applied, also when the apply failed part way. */
  operationId?: string;
  assets?: { path: string; action: string }[];
  generatedSecrets?: GeneratedSecret[];
}

/** What an import or reset works on: a JSON bundle, or a ZIP archive as the export writes it. */
export type BundleSource = { bundle: ConfigBundle } | { archive: File };

export const resourcesKey = (instance: Instance, tenant: Tenant) =>
  ['config-resources', instance, tenant] as const;

/** Every resource of the tenant with its owner (`GET /api/config-bundles/resources`). */
export function resourcesQuery(instance: Instance, tenant: Tenant) {
  return queryOptions({
    queryKey: resourcesKey(instance, tenant),
    queryFn: async (): Promise<Resource[]> =>
      ((await configPortabilityControllerResources()).data ?? []) as Resource[],
    enabled: !!instance,
  });
}

/** The latest configuration operations, newest first (`GET /api/config-bundles/operations`). */
export function operationsQuery(instance: Instance, tenant: Tenant, enabled: boolean) {
  return queryOptions({
    queryKey: ['config-operations', instance, tenant] as const,
    queryFn: async (): Promise<Operation[]> =>
      (await configPortabilityControllerOperations()).data ?? [],
    enabled: !!instance && enabled,
  });
}

/** The tenant's configuration as a ZIP archive, with its assets. */
export async function exportArchive(): Promise<Blob> {
  return (await configPortabilityControllerExport({ query: { format: 'zip' }, parseAs: 'blob' }))
    .data as unknown as Blob;
}

/** The tenant's configuration as one editable JSON bundle. */
export async function exportBundle(): Promise<ConfigBundle> {
  return (await configPortabilityControllerExport()).data as unknown as ConfigBundle;
}

function archiveBody(file: File): FormData {
  const body = new FormData();
  body.set('bundle', file);
  return body;
}

/** Plans an import without changing anything. */
export async function planImport(source: BundleSource, mode: ImportMode): Promise<ImportPlan> {
  const result =
    'archive' in source
      ? await configPortabilityControllerPlanArchive({
          body: archiveBody(source.archive),
          query: { mode },
        } as never)
      : await configPortabilityControllerPlan({ body: source.bundle, query: { mode } } as never);
  return result.data as unknown as ImportPlan;
}

/** Applies the plan with `planFingerprint`; the backend refuses it when the plan changed since. */
export async function applyImport(
  source: BundleSource,
  mode: ImportMode,
  planFingerprint: string
): Promise<ImportPlan> {
  const query = { mode, confirmReplace: String(mode === 'replace'), planFingerprint };
  const result =
    'archive' in source
      ? await configPortabilityControllerImportArchive({
          body: archiveBody(source.archive),
          query,
        } as never)
      : await configPortabilityControllerImport({ body: source.bundle, query } as never);
  return result.data as unknown as ImportPlan;
}

/** Makes a file-managed resource editable through the API and the Web Client. */
export async function detach(kind: ConfigResourceKind, id: string): Promise<void> {
  await configPortabilityControllerDetach({ path: { kind, id } });
}

/** Plans applying a resource's version from the server's config folder again. */
export async function planReattach(kind: ConfigResourceKind, id: string): Promise<ImportPlan> {
  return (await configPortabilityControllerPlanReattach({ path: { kind, id } }))
    .data as unknown as ImportPlan;
}

export async function reattach(
  kind: ConfigResourceKind,
  id: string,
  planFingerprint: string
): Promise<ImportPlan> {
  return (
    await configPortabilityControllerReattach({ path: { kind, id }, query: { planFingerprint } })
  ).data as unknown as ImportPlan;
}
