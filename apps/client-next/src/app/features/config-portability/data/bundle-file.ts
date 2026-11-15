import type { BundleSource, ConfigBundle } from './portability-queries';

/** The kind of each document schema file, as in `CONFIG_FORMATS` of the config format. */
const KIND_BY_SCHEMA_FILE: Record<string, string> = {
  TenantConfigFile: 'Tenant',
  ClientConfigFile: 'Client',
  KmsConfigFile: 'KmsConfig',
  KeyChainConfigFile: 'KeyChain',
  KeyChainDefaultsConfigFile: 'KeyChainDefaults',
  RegistrarConfigFile: 'RegistrarConfig',
  IssuanceConfigFile: 'IssuanceConfig',
  CredentialConfigFile: 'CredentialConfig',
  PresentationConfigFile: 'PresentationConfig',
  AttributeProviderConfigFile: 'AttributeProvider',
  WebhookEndpointConfigFile: 'WebhookEndpoint',
  TrustListConfigFile: 'TrustList',
  FederationTrustAnchorConfigFile: 'FederationTrustAnchor',
  StatusListConfigFile: 'StatusList',
};

const SINGLETON_IDS: Record<string, string> = {
  Tenant: 'tenant',
  KmsConfig: 'kms',
  RegistrarConfig: 'registrar',
  IssuanceConfig: 'issuance',
  KeyChainDefaults: 'defaults',
};

interface ConfigDocument {
  $schema: string;
  metadata?: { generation?: number };
  spec: Record<string, unknown>;
}

/** A single configuration document (`$schema` and `spec`), as a resource download saves it. */
function isConfigDocument(value: unknown): value is ConfigDocument {
  const document = value as Partial<ConfigDocument> | null;
  return (
    typeof document?.$schema === 'string' &&
    !!document.spec &&
    typeof document.spec === 'object' &&
    !Array.isArray(document.spec)
  );
}

async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * Wraps one configuration document into a bundle, so the import plans it as it plans an export.
 * The backend validates the document; this only names its kind and ID for the manifest.
 */
async function singleDocumentBundle(
  document: ConfigDocument,
  tenant: string
): Promise<ConfigBundle> {
  const file = /^https:\/\/eudiplo\.dev\/schemas\/v[1-9]\d*\/([A-Za-z]+)\.schema\.json$/.exec(
    document.$schema
  )?.[1];
  const kind = file ? KIND_BY_SCHEMA_FILE[file] : undefined;
  if (!kind) throw new Error(`Unknown configuration schema: ${document.$schema}`);
  const id =
    SINGLETON_IDS[kind] ?? (kind === 'Client' ? document.spec['clientId'] : document.spec['id']);
  if (typeof id !== 'string' || !id) {
    throw new Error(`The ${kind} document names no ${kind === 'Client' ? 'clientId' : 'id'}.`);
  }
  return {
    manifest: {
      format: 'eudiplo.config-bundle',
      formatVersion: 2,
      sourceVersion: 'document',
      exportedAt: new Date().toISOString(),
      tenant,
      resources: [
        {
          kind,
          id,
          $schema: document.$schema,
          path: 'resources/document.json',
          sha256: await sha256(JSON.stringify(document)),
          ownership: 'unmanaged',
          generation: document.metadata?.generation ?? 1,
        },
      ],
      assets: [],
      requirements: [],
      warnings: [],
    },
    documents: [document],
    assets: [],
  };
}

/**
 * What a chosen file holds for an import: a ZIP archive as the export writes it, a JSON bundle,
 * or one configuration document, which becomes a bundle of one. Throws on anything else.
 */
export async function readBundleFile(file: File, tenant: string): Promise<BundleSource> {
  if (file.name.toLowerCase().endsWith('.zip')) return { archive: file };
  let parsed: unknown;
  try {
    parsed = JSON.parse(await file.text());
  } catch {
    throw new Error(`${file.name} is neither a ZIP archive nor JSON.`);
  }
  if (isConfigDocument(parsed)) return { bundle: await singleDocumentBundle(parsed, tenant) };
  const bundle = parsed as Partial<ConfigBundle> | null;
  if (bundle?.manifest?.format !== 'eudiplo.config-bundle' || !Array.isArray(bundle.documents)) {
    throw new Error(
      `${file.name} is neither an EUDIPLO configuration bundle nor a configuration document.`
    );
  }
  return { bundle: bundle as ConfigBundle };
}
