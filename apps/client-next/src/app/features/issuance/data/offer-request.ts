import type { CredentialConfig, IssuanceConfig, OfferRequestDto } from '@eudiplo/sdk-core';

/**
 * How a credential reaches the wallet. The backend knows two flows; the authorization code flow
 * is offered twice, with an authorization server the issuer configured or with the built-in one
 * and its Interactive Authorization Endpoint (IAE).
 */
export type OfferFlow =
  'pre_authorized_code' | 'authorization_code_external' | 'authorization_code_iae';

export interface ServerOption {
  readonly value: string;
  readonly label: string;
}

type AuthorizationServer = IssuanceConfig['authorizationServers'][number];

/**
 * The authorization servers an offer can name, in the order the issuer configured them: enabled
 * ones only, and not the built-in one for the authorization code flow, which uses it implicitly.
 */
function serverOptions(
  config: IssuanceConfig | undefined,
  flow: 'authorization_code' | 'pre_authorized_code'
): ServerOption[] {
  return (config?.authorizationServers ?? [])
    .filter((server: AuthorizationServer) => server.enabled !== false)
    .filter((server) => flow !== 'authorization_code' || server.type !== 'built-in')
    .filter((server) => !!server.id && (server.type !== 'external' || !!server.issuer))
    .map((server) => ({
      value: server.id,
      label:
        server.label || (server.type === 'chained' ? 'Chained Authorization Server' : server.id),
    }));
}

/** The servers the user chooses from in `flow`; the IAE flow uses the built-in one, no choice. */
export function serverOptionsForFlow(
  config: IssuanceConfig | undefined,
  flow: OfferFlow
): ServerOption[] {
  if (flow === 'pre_authorized_code') return serverOptions(config, 'pre_authorized_code');
  if (flow === 'authorization_code_external') return serverOptions(config, 'authorization_code');
  return [];
}

/** Whether the server with `id` hands authentication on to an upstream OpenID provider. */
export function isChainedServer(config: IssuanceConfig | undefined, id: string): boolean {
  return config?.authorizationServers.find((server) => server.id === id)?.type === 'chained';
}

export function hasIae(config: CredentialConfig | undefined): boolean {
  return !!config?.iaeActions?.length;
}

/** The credentials an offer in `flow` can hold: with IAE for the IAE flow, without it otherwise. */
export function configsForFlow(
  configs: readonly CredentialConfig[],
  flow: OfferFlow
): CredentialConfig[] {
  return configs.filter((config) => hasIae(config) === (flow === 'authorization_code_iae'));
}

/** The namespace of an mdoc credential: the first element of its claims' paths. */
function mdocNamespace(config: CredentialConfig | undefined): string | undefined {
  if (config?.config?.format !== 'mso_mdoc') return undefined;
  const first = config.fields?.find((field) => Array.isArray(field.path) && field.path.length > 0);
  return first?.path?.[0] != null ? String(first.path[0]) : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

/** The schema of the claims form: an mdoc credential's claims without their namespace level. */
export function schemaForForm(
  config: CredentialConfig,
  schema: Record<string, unknown>
): Record<string, unknown> {
  const namespace = mdocNamespace(config);
  const properties = isRecord(schema['properties']) ? schema['properties'] : {};
  const names = Object.keys(properties);
  if (namespace && schema['type'] === 'object' && names.length === 1 && names[0] === namespace) {
    const inner = properties[namespace];
    if (isRecord(inner)) return inner;
  }
  return schema;
}

/** Claims as the form shows them: an mdoc credential's without their namespace level. */
export function claimsForForm(config: CredentialConfig | undefined, claims: unknown): unknown {
  const namespace = mdocNamespace(config);
  if (!namespace || !isRecord(claims)) return claims;
  return isRecord(claims[namespace]) ? claims[namespace] : claims;
}

/** Claims as the backend takes them: an mdoc credential's inside their namespace. */
export function claimsForSubmission(
  config: CredentialConfig | undefined,
  claims: unknown
): unknown {
  const namespace = mdocNamespace(config);
  if (!namespace || !isRecord(claims) || Object.hasOwn(claims, namespace)) return claims;
  return { [namespace]: claims };
}

/**
 * The flow the form shows for an earlier offer, which knows only the backend's two: an
 * authorization code offer without a server, of credentials with IAE, used the IAE flow.
 */
export function formFlowOf(
  offer: OfferRequestDto,
  configs: readonly CredentialConfig[]
): OfferFlow {
  if (offer.flow !== 'authorization_code') return 'pre_authorized_code';
  const withIae = offer.credentialConfigurationIds?.some((id) =>
    hasIae(configs.find((config) => config.id === id))
  );
  return withIae && !offer.authorization_server
    ? 'authorization_code_iae'
    : 'authorization_code_external';
}

/** Where the claims of one credential of a pre-authorized offer come from. */
type ClaimSource =
  | { readonly kind: 'form'; readonly claims: unknown }
  | { readonly kind: 'attributeProvider'; readonly providerId: string };

export interface OfferChoices {
  readonly flow: OfferFlow;
  readonly credentialIds: readonly string[];
  /** Pre-authorized code flow: the claims of each credential. */
  readonly claims: Readonly<Record<string, ClaimSource>>;
  /** Authorization code flows: the attribute provider of each credential, where one is chosen. */
  readonly providers: Readonly<Record<string, string>>;
  readonly txCode?: string;
  readonly txCodeDescription?: string;
  readonly authorizationServer?: string;
}

/** The offer request for the backend, as the current Web Client builds it. */
export function buildOfferRequest(
  choices: OfferChoices,
  configs: readonly CredentialConfig[]
): OfferRequestDto {
  const credentialClaims: NonNullable<OfferRequestDto['credentialClaims']> = {};
  if (choices.flow === 'pre_authorized_code') {
    for (const id of choices.credentialIds) {
      const source = choices.claims[id];
      if (source?.kind === 'form') {
        const config = configs.find((entry) => entry.id === id);
        credentialClaims[id] = {
          type: 'inline',
          claims: (claimsForSubmission(config, source.claims) ?? {}) as Record<string, unknown>,
        };
      } else if (source?.kind === 'attributeProvider') {
        credentialClaims[id] = {
          type: 'attributeProvider',
          attributeProviderId: source.providerId,
        };
      }
    }
  } else {
    for (const id of choices.credentialIds) {
      const providerId = choices.providers[id];
      if (providerId)
        credentialClaims[id] = { type: 'attributeProvider', attributeProviderId: providerId };
    }
  }
  const server =
    choices.flow === 'authorization_code_iae' ? undefined : choices.authorizationServer;
  const txCode = choices.flow === 'pre_authorized_code' ? choices.txCode?.trim() : undefined;
  return {
    flow: choices.flow === 'pre_authorized_code' ? 'pre_authorized_code' : 'authorization_code',
    response_type: 'uri',
    credentialConfigurationIds: [...choices.credentialIds],
    ...(Object.keys(credentialClaims).length ? { credentialClaims } : {}),
    ...(txCode
      ? {
          tx_code: txCode,
          ...(choices.txCodeDescription?.trim()
            ? { tx_code_description: choices.txCodeDescription.trim() }
            : {}),
        }
      : {}),
    ...(server ? { authorization_server: server } : {}),
  };
}
