import type {
  CredentialIssuerMetadataDto,
  ResolvedSchemaMetadataResponseDto,
} from '@eudiplo/sdk-core';

type JsonRecord = Record<string, unknown>;

function record(value: unknown): JsonRecord | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as JsonRecord)
    : null;
}

function claimPaths(value: unknown, prefix: string[] = []): { path: string[] }[] {
  if (Array.isArray(value)) {
    return value.flatMap((entry) => {
      const claim = record(entry);
      const path = claim?.['path'];
      return Array.isArray(path) && path.every((part) => typeof part === 'string')
        ? [{ path }]
        : [];
    });
  }
  const claims = record(value);
  if (!claims) return [];
  return Object.entries(claims).flatMap(([name, definition]) => {
    const claim = record(definition);
    if (!claim) return [{ path: [...prefix, name] }];
    const nested = claim['nested'];
    if (nested !== undefined) {
      return nested && typeof nested === 'object' && Object.keys(nested).length > 0
        ? claimPaths(nested, [...prefix, name])
        : [{ path: [...prefix, name] }];
    }
    const metadataKeys = ['value_type', 'mandatory', 'display', 'selective'];
    return Object.keys(claim).length === 0 ||
      Object.keys(claim).some((key) => metadataKeys.includes(key))
      ? [{ path: [...prefix, name] }]
      : claimPaths(claim, [...prefix, name]);
  });
}

function credentialId(value: string, used: Set<string>): string {
  const base =
    value
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, '_')
      .replace(/^_+|_+$/g, '') || 'credential';
  let id = base;
  for (let suffix = 2; used.has(id); suffix++) id = `${base}_${suffix}`;
  used.add(id);
  return id;
}

/** Builds editable DCQL from supported OID4VCI credential metadata. */
export function dcqlFromIssuer(metadata: CredentialIssuerMetadataDto): object {
  const configurations = record(metadata.credential_configurations_supported);
  if (!configurations) throw new Error('Issuer metadata has no credential configurations.');

  const used = new Set<string>();
  const credentials = Object.entries(configurations).flatMap(([key, raw]) => {
    const config = record(raw);
    const format = config?.['format'];
    if (!config || typeof format !== 'string') return [];
    const normalizedFormat =
      format === 'vc+sd-jwt' || format === 'dc+sd-jwt'
        ? 'dc+sd-jwt'
        : format === 'mso_mdoc'
          ? 'mso_mdoc'
          : null;
    if (!normalizedFormat) return [];

    const type = normalizedFormat === 'mso_mdoc' ? config['doctype'] : config['vct'];
    if (typeof type !== 'string' || !type) return [];
    const meta = normalizedFormat === 'mso_mdoc' ? { doctype_value: type } : { vct_values: [type] };
    const credentialMetadata = record(config['credential_metadata']);
    const claims = claimPaths(
      credentialMetadata?.['claims'] ??
        (normalizedFormat === 'mso_mdoc' ? config['claims_namespaced'] : config['claims'])
    );
    return [
      {
        id: credentialId(key, used),
        format: normalizedFormat,
        meta,
        ...(claims.length ? { claims } : {}),
      },
    ];
  });

  if (!credentials.length) {
    throw new Error('Issuer metadata has no supported SD-JWT VC or mDOC credentials.');
  }
  return { credentials };
}

/** Extracts the DCQL query and suggested name from resolved schema metadata. */
export function dcqlFromSchema(resolved: ResolvedSchemaMetadataResponseDto): {
  query: object;
  id: string;
  description: string;
} {
  const query = record(resolved.schema.dcqlQuery);
  const credentials = query?.['credentials'];
  if (!Array.isArray(credentials) || !credentials.length) {
    throw new Error('Schema metadata did not resolve to a DCQL credential query.');
  }
  const name = resolved.schema.name || resolved.schema.id;
  const version = resolved.schema.version
    ? `_v${resolved.schema.version.replace(/[^0-9a-zA-Z]+/g, '_')}`
    : '';
  const id = `${
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '') || 'schema'
  }${version}`.slice(0, 64);
  return {
    query: { ...query },
    id,
    description:
      resolved.schema.description ||
      `Imported from schema ${name}${resolved.schema.version ? ` (v${resolved.schema.version})` : ''}`,
  };
}
