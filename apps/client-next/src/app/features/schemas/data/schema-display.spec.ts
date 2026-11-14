import type { CredentialConfig } from '@eudiplo/sdk-core';
import { describe, expect, it } from 'vitest';
import {
  catalogIdOf,
  configForSchemaUri,
  groupSchemas,
  jwtUrlOf,
  knownClassification,
  linkedConfigs,
  nextVersionConfig,
  trustListIdOf,
} from './schema-display';
import type { SchemaEntry } from './schema-queries';

const encode = (value: unknown) =>
  btoa(JSON.stringify(value)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const jwt = (payload: unknown) => `${encode({ alg: 'ES256' })}.${encode(payload)}.c2ln`;

const entry = (extra: Partial<SchemaEntry> = {}): SchemaEntry =>
  ({
    id: 'gym',
    version: '1.0.0',
    displayName: 'Gym membership',
    issuer: 'Acme',
    attestationLoS: 'iso_18045_basic',
    bindingType: 'key',
    rulebookURI: 'https://rules.example/gym.md',
    schemaURIs: [
      { id: 's1', formatIdentifier: 'dc+sd-jwt', uri: 'https://registrar.example/files/abc' },
    ],
    trustedAuthorities: [
      {
        id: 't1',
        frameworkType: 'etsi_tl',
        value: 'https://acme.example/issuers/acme/trust-list/tl-1',
      },
    ],
    category: 'identity',
    tags: ['membership', 'legacy-tag'],
    signedJwt: jwt({ id: 'https://catalog.example/attestations/gym/' }),
    updatedAt: '2026-10-01T10:00:00Z',
    deprecated: false,
    ...extra,
  }) as SchemaEntry;

const config = (id: string, extra: Record<string, unknown> = {}) =>
  ({
    id,
    config: { format: 'dc+sd-jwt' },
    vct: `https://acme.example/${id}`,
    ...extra,
  }) as unknown as CredentialConfig;

describe('schema display', () => {
  it('groups versions by schema, newest version first, latest change first', () => {
    const groups = groupSchemas([
      entry({ version: '1.0.0', updatedAt: '2026-01-01T00:00:00Z' }),
      entry({ version: '1.10.0', updatedAt: '2026-03-01T00:00:00Z', deprecated: true }),
      entry({ version: '1.2.0', updatedAt: '2026-02-01T00:00:00Z' }),
      entry({ id: 'pid', displayName: '', version: '2.0.0', updatedAt: '2026-04-01T00:00:00Z' }),
    ]);

    expect(groups.map((group) => [group.id, group.name, group.versions, group.deprecated])).toEqual(
      [
        ['pid', 'pid', ['2.0.0'], false],
        ['gym', 'Gym membership', ['1.10.0', '1.2.0', '1.0.0'], true],
      ]
    );
  });

  it('reads the catalog ID and the JWT URL from the signed JWT', () => {
    expect(catalogIdOf(entry().signedJwt)).toBe('https://catalog.example/attestations/gym');
    expect(jwtUrlOf(entry())).toBe('https://catalog.example/attestations/gym/versions/1.0.0/jwt');
    expect(catalogIdOf('not a jwt')).toBeNull();
    expect(trustListIdOf('https://acme.example/issuers/acme/trust-list/tl-1')).toBe('tl-1');
    expect(trustListIdOf('https://lotl.example/eu')).toBeNull();
  });

  it('finds the linked credential types, by schemaMeta or by a schema URI that names them', () => {
    const configs = [
      config('gym-card', { schemaMeta: { id: 'https://catalog.example/attestations/gym' } }),
      config('pid'),
    ];
    expect(linkedConfigs(entry(), configs).map((item) => item.id)).toEqual(['gym-card']);
    expect(
      configForSchemaUri('https://registrar.example/files/abc', 'dc+sd-jwt', configs)
    ).toBeUndefined();
    expect(configForSchemaUri(undefined, 'dc+sd-jwt', [configs[0]])?.id).toBe('gym-card');
  });

  it('carries over only the category and tags the registrar vocabulary knows', () => {
    const vocabulary = {
      version: '1',
      categories: [{ code: 'identity', label: 'Identity', status: 'active' as const }],
      tags: [{ code: 'membership', label: 'Membership', status: 'active' as const }],
    };
    expect(knownClassification(entry(), vocabulary)).toEqual({
      category: 'identity',
      tags: ['membership'],
      dropped: ['legacy-tag'],
      checked: true,
    });
    expect(knownClassification(entry(), undefined).checked).toBe(false);
  });

  it('builds the next version from the linked credential type, keeping name and trust', () => {
    const next = nextVersionConfig(entry(), {
      version: '1.1.0',
      rulebookURI: '',
      linked: [config('gym-card')],
      vocabulary: undefined,
    });
    expect(next).toMatchObject({
      id: 'https://catalog.example/attestations/gym',
      name: 'Gym membership',
      version: '1.1.0',
      rulebookURI: 'https://rules.example/gym.md',
      schemaURIs: [
        {
          format: 'dc+sd-jwt',
          uri: 'https://registrar.example/files/abc',
          meta: { vct: 'https://acme.example/gym-card' },
        },
      ],
      trustedAuthorities: [
        { frameworkType: 'etsi_tl', value: 'https://acme.example/issuers/acme/trust-list/tl-1' },
      ],
    });
    expect(() =>
      nextVersionConfig(entry(), {
        version: '1.1.0',
        rulebookURI: '',
        linked: [],
        vocabulary: undefined,
      })
    ).toThrow('Link exactly one credential type of format dc+sd-jwt');
  });
});
