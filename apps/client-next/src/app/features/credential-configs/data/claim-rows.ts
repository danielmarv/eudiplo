import {
  type ClaimFieldDefinition,
  type CredentialConfig,
  deriveRuntimeArtifacts,
  flattenFields,
} from '@eudiplo/sdk-core';

/**
 * What a credential type says about each of its claims, for the detail page: from its `fields`
 * when it has them, else from the older `claims`, `disclosureFrame`, `schema` and claims metadata.
 */

type Path = (string | number | null)[];

export type Disclosable = 'Yes' | 'No' | 'N/A' | 'Not configured';

export interface ClaimRow {
  /** The claim path, with `*` for array items. */
  key: string;
  hasDefaultValue: boolean;
  defaultValue?: unknown;
  disclosable: Disclosable;
  /** Null when nothing says whether wallets must have it. */
  mandatory: boolean | null;
  type: string | null;
  /** "locale: name" per localized label. */
  labels: string[];
  /** JSON Schema keywords the field adds on top of its type; only fields define them. */
  constraints?: Record<string, unknown>;
  description?: string;
}

interface SchemaPathInfo {
  required: Set<string>;
  known: Set<string>;
  types: Map<string, string>;
}

/** A claim path as a key: segments joined by `separator`, array items as `*`. */
function pathToKey(path: Path, separator = '.'): string {
  return path
    .map((segment) => (segment === null || typeof segment === 'number' ? '*' : String(segment)))
    .join(separator);
}

const isMdoc = (config: CredentialConfig) => config.config.format === 'mso_mdoc';

/** The `fields` of a credential type; empty for one that predates them. */
function fieldsOf(config: CredentialConfig): ClaimFieldDefinition[] {
  const value = (config as { fields?: unknown }).fields;
  return Array.isArray(value) ? (value as ClaimFieldDefinition[]) : [];
}

/**
 * What wallets and the issuer derive from the fields: claims, disclosure frame, claims metadata,
 * JSON schema and the mdoc claims by namespace.
 */
function artifacts(config: CredentialConfig) {
  return deriveRuntimeArtifacts(fieldsOf(config) as never) as unknown as {
    claimsByNamespace: Record<string, Record<string, unknown>>;
    schema: Record<string, unknown>;
  };
}

/** The JSON schema the claims are checked against, or null without one. */
export function schemaOf(config: CredentialConfig): Record<string, unknown> | null {
  if (fieldsOf(config).length) return artifacts(config).schema;
  const value = (config as { schema?: unknown }).schema;
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null;
}

/** The mdoc claims by namespace, or null without any. */
export function claimsByNamespaceOf(config: CredentialConfig): Record<string, unknown> | null {
  if (fieldsOf(config).length) {
    const value = artifacts(config).claimsByNamespace;
    return Object.keys(value).length ? value : null;
  }
  const value = (config.config as { claimsByNamespace?: unknown }).claimsByNamespace;
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null;
}

function labelsOf(display: unknown): string[] {
  if (!Array.isArray(display)) return [];
  return display.flatMap((entry) => {
    const record = (entry ?? {}) as Record<string, unknown>;
    const locale = typeof record['locale'] === 'string' ? record['locale'] : 'default';
    return typeof record['name'] === 'string' ? [`${locale}: ${record['name']}`] : [];
  });
}

function textOf(value: unknown): string | undefined {
  return typeof value === 'string' && value ? value : undefined;
}

function constraintsOf(field: object): Record<string, unknown> | undefined {
  const value = (field as Record<string, unknown>)['constraints'];
  return value && typeof value === 'object' && Object.keys(value).length
    ? (value as Record<string, unknown>)
    : undefined;
}

/** Every claim of the credential type, sorted by path. */
export function claimRows(config: CredentialConfig): ClaimRow[] {
  const mdoc = isMdoc(config);
  const fields = fieldsOf(config);
  if (fields.length) {
    return flattenFields(fields)
      .filter((field) => Array.isArray(field.path) && field.path.length > 0)
      .map((field) => {
        const hasDefaultValue = Object.prototype.hasOwnProperty.call(field, 'defaultValue');
        return {
          key: pathToKey(field.path as Path),
          hasDefaultValue,
          defaultValue: hasDefaultValue ? field.defaultValue : undefined,
          disclosable: mdoc
            ? 'N/A'
            : field.disclosable === true
              ? 'Yes'
              : field.disclosable === false
                ? 'No'
                : 'Not configured',
          mandatory: typeof field.mandatory === 'boolean' ? field.mandatory : null,
          type: typeof field.type === 'string' ? field.type : null,
          labels: labelsOf(field.display),
          constraints: constraintsOf(field),
          description: textOf((field as unknown as { description?: unknown }).description),
        } satisfies ClaimRow;
      })
      .sort((a, b) => a.key.localeCompare(b.key));
  }
  return legacyRows(config, mdoc);
}

/** Rows of a credential type without `fields`, merged from its separate artifacts. */
function legacyRows(config: CredentialConfig, mdoc: boolean): ClaimRow[] {
  const raw = config as unknown as Record<string, unknown>;
  const defaults = new Map<string, unknown>();
  for (const leaf of leaves(raw['claims'])) defaults.set(pathToKey(leaf.path), leaf.value);
  const disclosurePaths = collectDisclosurePaths(raw['disclosureFrame']);
  const schema = collectSchemaPathInfo(raw['schema']);
  const metadata = (config.config as { claimsMetadata?: unknown }).claimsMetadata;

  const disclosable = (key: string, fromMetadata?: boolean): Disclosable => {
    if (mdoc) return 'N/A';
    if (typeof fromMetadata === 'boolean') return fromMetadata ? 'Yes' : 'No';
    if (!disclosurePaths.size) return 'Not configured';
    for (const path of disclosurePaths) {
      if (isPrefix(path, key) || isPrefix(key, path)) return 'Yes';
    }
    return 'No';
  };
  const mandatory = (key: string, fromMetadata?: boolean): boolean | null => {
    if (typeof fromMetadata === 'boolean') return fromMetadata;
    if (schema.required.has(key)) return true;
    return schema.known.has(key) ? false : null;
  };

  const rows = new Map<string, ClaimRow>();
  for (const claim of Array.isArray(metadata) ? (metadata as Record<string, unknown>[]) : []) {
    const key = pathToKey(Array.isArray(claim['path']) ? (claim['path'] as Path) : []);
    const type = ['type', 'valueType', 'value_type']
      .map((name) => claim[name])
      .find((value): value is string => typeof value === 'string');
    rows.set(key, {
      key,
      hasDefaultValue: defaults.has(key),
      defaultValue: defaults.get(key),
      disclosable: disclosable(
        key,
        typeof claim['disclosable'] === 'boolean' ? claim['disclosable'] : undefined
      ),
      mandatory: mandatory(
        key,
        typeof claim['mandatory'] === 'boolean' ? claim['mandatory'] : undefined
      ),
      type: type ?? schema.types.get(key) ?? null,
      labels: labelsOf(claim['display']),
    });
  }
  for (const [key, defaultValue] of defaults) {
    if (rows.has(key)) continue;
    rows.set(key, {
      key,
      hasDefaultValue: true,
      defaultValue,
      disclosable: disclosable(key),
      mandatory: mandatory(key),
      type: schema.types.get(key) ?? typeOfValue(defaultValue),
      labels: [],
    });
  }
  return [...rows.values()].sort((a, b) => a.key.localeCompare(b.key));
}

/** Whether every row says its type, whether it is mandatory and whether it is disclosable. */
export function rowsComplete(rows: readonly ClaimRow[], mdoc: boolean): boolean {
  return rows.every(
    (row) =>
      !!row.type &&
      row.mandatory !== null &&
      (mdoc ? row.disclosable === 'N/A' : row.disclosable !== 'Not configured')
  );
}

function leaves(value: unknown, path: Path = []): { path: Path; value: unknown }[] {
  if (value === null || value === undefined) return [];
  if (Array.isArray(value)) {
    return value.length
      ? value.flatMap((item) => leaves(item, [...path, null]))
      : [{ path, value }];
  }
  if (typeof value === 'object') {
    const keys = Object.keys(value as object);
    return keys.length
      ? keys.flatMap((key) => leaves((value as Record<string, unknown>)[key], [...path, key]))
      : [{ path, value }];
  }
  return [{ path, value }];
}

/** The claims an SD-JWT disclosure frame marks as disclosable (`_sd` arrays and `true`). */
function collectDisclosurePaths(frame: unknown, base: Path = []): Set<string> {
  const paths = new Set<string>();
  if (!frame || typeof frame !== 'object') return paths;
  const record = frame as Record<string, unknown>;
  if (Array.isArray(record['_sd'])) {
    for (const name of record['_sd']) {
      if (typeof name === 'string' && name) paths.add(pathToKey([...base, name]));
    }
  }
  for (const [key, value] of Object.entries(record)) {
    if (key.startsWith('_')) continue;
    if (value === true) {
      paths.add(pathToKey([...base, key]));
      continue;
    }
    for (const nested of collectDisclosurePaths(value, [...base, key])) paths.add(nested);
  }
  return paths;
}

function isPrefix(prefixPath: string, candidatePath: string): boolean {
  const prefix = prefixPath.split('.');
  const candidate = candidatePath.split('.');
  if (prefix.length > candidate.length) return false;
  return prefix.every((segment, index) => segment === '*' || segment === candidate[index]);
}

function collectSchemaPathInfo(schema: unknown): SchemaPathInfo {
  const required = new Set<string>();
  const known = new Set<string>();
  const types = new Map<string, string>();
  const walk = (node: unknown, path: Path, parentRequired: boolean): void => {
    if (!node || typeof node !== 'object') return;
    const record = node as Record<string, unknown>;
    if (record['type'] === 'array' || record['items']) {
      const arrayPath = [...path, null];
      const key = pathToKey(arrayPath);
      known.add(key);
      types.set(key, 'array');
      if (parentRequired) required.add(key);
      walk(record['items'], arrayPath, parentRequired);
    }
    const properties =
      record['properties'] && typeof record['properties'] === 'object'
        ? (record['properties'] as Record<string, unknown>)
        : undefined;
    const requiredHere = new Set(
      Array.isArray(record['required'])
        ? (record['required'] as unknown[]).filter(
            (value): value is string => typeof value === 'string'
          )
        : []
    );
    for (const [name, child] of Object.entries(properties ?? {})) {
      const childPath = [...path, name];
      const key = pathToKey(childPath);
      known.add(key);
      const type = schemaTypeLabel(child);
      if (type) types.set(key, type);
      if (requiredHere.has(name)) required.add(key);
      walk(child, childPath, parentRequired && requiredHere.has(name));
    }
    for (const combinator of ['oneOf', 'anyOf', 'allOf']) {
      if (Array.isArray(record[combinator])) {
        for (const variant of record[combinator] as unknown[]) walk(variant, path, parentRequired);
      }
    }
  };
  walk(schema, [], true);
  return { required, known, types };
}

function schemaTypeLabel(node: unknown): string | null {
  if (!node || typeof node !== 'object') return null;
  const record = node as Record<string, unknown>;
  const type = record['type'];
  if (typeof type === 'string') return type;
  if (Array.isArray(type)) {
    const labels = type.filter((value): value is string => typeof value === 'string');
    return labels.length ? labels.join(' | ') : null;
  }
  const merged = ['oneOf', 'anyOf', 'allOf']
    .map((name) => record[name])
    .filter(Array.isArray)
    .flatMap((variants) =>
      (variants as unknown[]).map(schemaTypeLabel).filter((label): label is string => !!label)
    );
  if (merged.length) return [...new Set(merged)].join(' | ');
  if (record['properties'] && typeof record['properties'] === 'object') return 'object';
  return record['items'] ? 'array' : null;
}

function typeOfValue(value: unknown): string | null {
  if (Array.isArray(value)) return 'array';
  if (value === null) return 'null';
  if (typeof value === 'object') return 'object';
  if (typeof value === 'number') return Number.isInteger(value) ? 'integer' : 'number';
  return typeof value === 'string' || typeof value === 'boolean' ? typeof value : null;
}
