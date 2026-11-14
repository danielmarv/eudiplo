import type {
  CredentialConfig,
  PublishSchemaMetaConfig,
  SchemaMetadataVocabulariesDto,
  VocabularyEntryDto,
} from '@eudiplo/sdk-core';
import { decodeJwtPart } from '../../../shared/format/jwt';
import type { SchemaEntry } from './schema-queries';
import { compareVersionsDesc } from './schema-version';

export const LOS_OPTIONS: { value: SchemaEntry['attestationLoS']; label: string }[] = [
  { value: 'iso_18045_high', label: 'High' },
  { value: 'iso_18045_moderate', label: 'Moderate' },
  { value: 'iso_18045_enhanced-basic', label: 'Enhanced basic' },
  { value: 'iso_18045_basic', label: 'Basic' },
];

export const BINDING_OPTIONS: { value: SchemaEntry['bindingType']; label: string }[] = [
  { value: 'key', label: 'Key' },
  { value: 'claim', label: 'Claim' },
  { value: 'biometric', label: 'Biometric' },
  { value: 'none', label: 'None' },
];

export function losLabel(value: string): string {
  return `${LOS_OPTIONS.find((option) => option.value === value)?.label ?? value} (ISO 18045)`;
}

export function bindingLabel(value: string): string {
  return BINDING_OPTIONS.find((option) => option.value === value)?.label ?? value;
}

/** The name the catalog shows, else the ID. */
export function schemaName(entry: Pick<SchemaEntry, 'displayName' | 'id'>): string {
  return entry.displayName?.trim() || entry.id;
}

/** A schema with all its versions, newest first, and its latest name and issuer. */
export interface SchemaGroup {
  id: string;
  name: string;
  issuer: string;
  updatedAt: string;
  versions: string[];
  /** Whether the newest version is deprecated. */
  deprecated: boolean;
}

/** The versions grouped by schema, most recently changed first. */
export function groupSchemas(entries: readonly SchemaEntry[]): SchemaGroup[] {
  const groups = new Map<string, { latest: SchemaEntry; versions: Set<string> }>();
  for (const entry of entries) {
    const group = groups.get(entry.id);
    if (!group) {
      groups.set(entry.id, { latest: entry, versions: new Set([entry.version]) });
      continue;
    }
    group.versions.add(entry.version);
    if (new Date(entry.updatedAt).getTime() > new Date(group.latest.updatedAt).getTime()) {
      group.latest = entry;
    }
  }
  return [...groups.values()]
    .map(({ latest, versions }) => {
      const sorted = [...versions].sort(compareVersionsDesc);
      const newest = entries.find((entry) => entry.id === latest.id && entry.version === sorted[0]);
      return {
        id: latest.id,
        name: schemaName(latest),
        issuer: latest.issuer,
        updatedAt: latest.updatedAt,
        versions: sorted,
        deprecated: !!newest?.deprecated,
      };
    })
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
}

/** The catalog ID of the schema, from the `id` claim of its signed JWT; null without one. */
export function catalogIdOf(jwt: string | undefined): string | null {
  if (!jwt) return null;
  try {
    const id = decodeJwtPart(jwt, 'payload')['id'];
    return typeof id === 'string' && id ? id.replace(/\/$/, '') : null;
  } catch {
    return null;
  }
}

/** Where the registrar serves the signed JWT of the version. */
export function jwtUrlOf(entry: Pick<SchemaEntry, 'signedJwt' | 'version'>): string {
  const id = catalogIdOf(entry.signedJwt);
  if (!id) return '';
  return /\/versions\/[^/]+\/jwt$/.test(id) ? id : `${id}/versions/${entry.version}/jwt`;
}

/** The ID of a trust list of this instance, from its URL (`…/trust-list/<id>`); null otherwise. */
export function trustListIdOf(value: string): string | null {
  try {
    const segments = new URL(value).pathname.split('/').filter(Boolean);
    const index = segments.indexOf('trust-list');
    return index !== -1 && segments[index + 1] ? segments[index + 1] : null;
  } catch {
    return null;
  }
}

/**
 * The credential types linked to the schema: by their `schemaMeta.id`, or, for entries whose ID
 * was not written back, by a schema URI that names them (`/schema/{credentialConfigId}/{format}`).
 */
export function linkedConfigs(
  entry: Pick<SchemaEntry, 'id' | 'schemaURIs'>,
  configs: readonly CredentialConfig[]
): CredentialConfig[] {
  return configs.filter((config) => {
    const linked = config.schemaMeta?.id;
    const byId = !!linked && (linked === entry.id || linked.split('/').pop() === entry.id);
    const byUri = (entry.schemaURIs ?? []).some((schema) =>
      schema.uri?.includes(`/schema/${config.id}/`)
    );
    return byId || byUri;
  });
}

/**
 * The linked credential type a schema URI was built from: the one the URI names, else the only
 * one of its format, as the registrar stores uploaded schemas under random names.
 */
export function configForSchemaUri(
  uri: string | undefined,
  format: string,
  linked: readonly CredentialConfig[]
): CredentialConfig | undefined {
  const named = uri ? linked.find((config) => uri.includes(`/schema/${config.id}/`)) : undefined;
  if (named) return named;
  const sameFormat = linked.filter((config) => config.config?.format === format);
  return sameFormat.length === 1 ? sameFormat[0] : undefined;
}

/** What a schema URI's metadata says about the credential type: its vct or docType. */
function schemaUriMeta(config: CredentialConfig): Record<string, unknown> {
  if (config.config.format === 'dc+sd-jwt') {
    const vct = typeof config.vct === 'string' ? config.vct : config.vct?.vct;
    if (!vct) throw new Error(`The credential type ${config.id} has no vct.`);
    return { vct };
  }
  const docType = config.config.docType;
  if (!docType) throw new Error(`The credential type ${config.id} has no docType.`);
  return { doctype_value: docType };
}

/** A vocabulary entry as an option: its label and code, and what replaces a deprecated one. */
export function vocabularyLabel(entry: VocabularyEntryDto): string {
  const base = `${entry.label} (${entry.code})`;
  if (entry.status !== 'deprecated') return base;
  return entry.replacedBy ? `${base}, deprecated: use ${entry.replacedBy}` : `${base}, deprecated`;
}

type Category = PublishSchemaMetaConfig['category'];
type Tags = NonNullable<PublishSchemaMetaConfig['tags']>;

/**
 * The category and tags of a version that the registrar vocabulary lists, and the values it
 * would refuse: the registrar returns tags as free text, but refuses a publish with a value
 * outside the vocabulary. Deprecated codes stay valid. Without a vocabulary every value is
 * carried over unchecked.
 */
export function knownClassification(
  entry: Pick<SchemaEntry, 'category' | 'tags'>,
  vocabulary: SchemaMetadataVocabulariesDto | undefined
): { category?: Category; tags: Tags; dropped: string[]; checked: boolean } {
  if (!vocabulary) {
    return {
      category: (entry.category || undefined) as Category,
      tags: (entry.tags ?? []) as Tags,
      dropped: [],
      checked: false,
    };
  }
  const categories = new Set(vocabulary.categories.map((item) => item.code));
  const tagCodes = new Set(vocabulary.tags.map((item) => item.code));
  const dropped: string[] = [];
  let category: Category;
  if (entry.category && categories.has(entry.category)) category = entry.category;
  else if (entry.category) dropped.push(entry.category);
  const tags: string[] = [];
  for (const tag of entry.tags ?? []) {
    if (tagCodes.has(tag)) tags.push(tag);
    else dropped.push(tag);
  }
  return { category, tags: tags as Tags, dropped, checked: true };
}

/**
 * The configuration of a new version of `entry`: the same schema URIs, rebuilt from the linked
 * credential types, the same trusted authorities, and the name, category and tags, which the
 * registrar does not copy. Throws when a schema URI matches no single linked credential type.
 */
export function nextVersionConfig(
  entry: SchemaEntry,
  options: {
    version: string;
    rulebookURI: string;
    linked: readonly CredentialConfig[];
    vocabulary: SchemaMetadataVocabulariesDto | undefined;
  }
): PublishSchemaMetaConfig {
  const id = catalogIdOf(entry.signedJwt);
  if (!id) throw new Error('The signed JWT of this version names no catalog ID.');
  const { category, tags } = knownClassification(entry, options.vocabulary);
  return {
    id,
    name: schemaName(entry),
    version: options.version,
    rulebookURI: options.rulebookURI || entry.rulebookURI,
    attestationLoS: entry.attestationLoS,
    bindingType: entry.bindingType,
    ...(category ? { category } : {}),
    ...(tags.length ? { tags } : {}),
    schemaURIs: (entry.schemaURIs ?? []).map((schema) => {
      const config = configForSchemaUri(schema.uri, schema.formatIdentifier, options.linked);
      if (!config) {
        throw new Error(
          `Link exactly one credential type of format ${schema.formatIdentifier} to this schema to rebuild its schema URI.`
        );
      }
      return { format: schema.formatIdentifier, uri: schema.uri, meta: schemaUriMeta(config) };
    }),
    trustedAuthorities: (entry.trustedAuthorities ?? []).map((authority) => ({
      frameworkType: authority.frameworkType,
      value: authority.value,
    })),
  };
}
