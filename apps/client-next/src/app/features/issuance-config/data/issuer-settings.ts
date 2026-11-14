import type { IssuanceConfig } from '@eudiplo/sdk-core';
import { duration } from '../../../shared/format/duration';

type AuthorizationServer = IssuanceConfig['authorizationServers'][number];
type ServerType = AuthorizationServer['type'];
type StatusCheckMode = IssuanceConfig['walletAttestationStatusCheckMode'];
type RegistrationCertificate = NonNullable<IssuanceConfig['registrationCertificate']>;

/** The backend's limit of failed transaction code attempts when the issuer sets none. */
export const DEFAULT_TX_CODE_MAX_ATTEMPTS = 5;

/** How long a refresh token lives when an authorization server sets no lifetime: 30 days. */
const DEFAULT_REFRESH_TOKEN_SECONDS = 2_592_000;

const SERVER_TYPES: Record<ServerType, { label: string; summary: string }> = {
  'built-in': {
    label: 'Built-in',
    summary: "EUDIPLO's own authorization server for this issuer.",
  },
  chained: {
    label: 'Chained',
    summary: 'Users sign in at an upstream OpenID provider, and EUDIPLO issues the access token.',
  },
  oid4vp: {
    label: 'OID4VP',
    summary: 'Wallets authorize by presenting a credential.',
  },
  external: {
    label: 'External',
    summary: 'An authorization server of your own issues the access tokens.',
  },
};

/** How the status list of a presented wallet or key attestation is checked; best effort when unset. */
export function statusCheckModeLabel(mode: StatusCheckMode | undefined): string {
  switch (mode) {
    case 'strict':
      return 'Strict';
    case 'disabled':
      return 'Disabled';
    default:
      return 'Best effort';
  }
}

/** The access token lifetime the backend uses when a server sets none: 5 minutes built-in, else 1 hour. */
function defaultTokenLifetimeSeconds(type: ServerType): number {
  return type === 'built-in' ? 300 : 3600;
}

/** What EUDIPLO enforces for an authorization server it runs. */
interface ServerPolicy {
  dpop: 'Required' | 'Optional';
  /** The server's own status check mode, or the issuer's that it inherits. */
  statusCheck: string;
  statusCheckInherited: boolean;
  tokenLifetime: string;
  tokenLifetimeIsDefault: boolean;
  /** How long refresh tokens live, or "Off". */
  refresh: string;
}

export interface ServerView {
  id: string;
  name: string;
  type: ServerType;
  typeLabel: string;
  summary: string;
  enabled: boolean;
  /** The server wallets are sent to: the first enabled one. */
  preferred: boolean;
  /** Undefined for an external server, which issues its own tokens. */
  policy?: ServerPolicy;
  details: { label: string; value: string }[];
}

/**
 * The issuer's authorization servers as they are shown, in their order. An external server
 * without an issuer URL is left out, as the backend ignores it.
 */
export function authorizationServers(config: IssuanceConfig): ServerView[] {
  const views = (config.authorizationServers ?? [])
    .filter((server) => server.type !== 'external' || !!server.issuer)
    .filter((server) => server.type in SERVER_TYPES)
    .map((server) => serverView(server, config.walletAttestationStatusCheckMode));
  const preferred = views.find((view) => view.enabled);
  if (preferred) preferred.preferred = true;
  return views;
}

function serverView(server: AuthorizationServer, issuerStatusCheck: StatusCheckMode): ServerView {
  const view: ServerView = {
    id: server.id ?? '',
    name: server.label || (server.type === 'external' ? server.issuer : server.id) || 'Unnamed',
    type: server.type,
    typeLabel: SERVER_TYPES[server.type].label,
    summary: SERVER_TYPES[server.type].summary,
    enabled: server.enabled !== false,
    preferred: false,
    details: [],
  };
  if (server.type === 'external') {
    view.details.push({ label: 'Issuer', value: server.issuer });
    return view;
  }

  const lifetime = server.token?.lifetimeSeconds;
  const refreshSeconds =
    server.token?.refreshTokenExpiresInSeconds || DEFAULT_REFRESH_TOKEN_SECONDS;
  view.policy = {
    dpop: server.requireDPoP ? 'Required' : 'Optional',
    statusCheck: statusCheckModeLabel(server.walletAttestationStatusCheckMode ?? issuerStatusCheck),
    statusCheckInherited: !server.walletAttestationStatusCheckMode,
    tokenLifetime: duration(lifetime || defaultTokenLifetimeSeconds(server.type)),
    tokenLifetimeIsDefault: !lifetime,
    refresh: (server.token?.refreshTokenEnabled ?? true) ? duration(refreshSeconds) : 'Off',
  };
  if (server.type === 'oid4vp') {
    // Configurations of 8.x nest the ID under `oid4vp`.
    const legacy = (server as { oid4vp?: { presentationConfigId?: string } }).oid4vp;
    view.details.push({
      label: 'Presentation',
      value: server.presentationConfigId || legacy?.presentationConfigId || 'Not set',
    });
  } else if (server.type === 'chained') {
    view.details.push(
      { label: 'Upstream issuer', value: server.upstream?.issuer || 'Not set' },
      { label: 'Client ID', value: server.upstream?.clientId || 'Not set' }
    );
    if (server.upstream?.scopes?.length) {
      view.details.push({ label: 'Scopes', value: server.upstream.scopes.join(' ') });
    }
  }
  return view;
}

/** Where the issuer's registration certificate stands. */
export type RegistrationStatus = 'off' | 'pending' | 'active' | 'expiring' | 'expired';

const WEEK_SECONDS = 7 * 24 * 3600;

/**
 * Off without a registration certificate, pending until one is cached, expiring in its last
 * week and expired after it.
 */
export function registrationStatus(
  config: IssuanceConfig,
  nowSeconds = Math.floor(Date.now() / 1000)
): RegistrationStatus {
  if (!config.registrationCertificate?.enabled) return 'off';
  const cache = config.registrationCertificateCache;
  if (!cache) return 'pending';
  if (typeof cache.expiresAt === 'number') {
    if (cache.expiresAt < nowSeconds) return 'expired';
    if (cache.expiresAt - nowSeconds < WEEK_SECONDS) return 'expiring';
  }
  return 'active';
}

/** EUDIPLO generates the certificate at the registrar, also when the mode is unset. */
export function generatesCertificate(config: IssuanceConfig): boolean {
  return (config.registrationCertificate?.mode ?? 'generate') === 'generate';
}

/** The certificate wallets get: the one generated last, else the imported one. */
export function registrationJwt(config: IssuanceConfig): string | undefined {
  return (
    config.registrationCertificateCache?.jwt || config.registrationCertificate?.jwt || undefined
  );
}

/** When a generated certificate is renewed. */
export function renewalLabel(renewal: RegistrationCertificate['renewal']): string {
  switch (renewal) {
    case 'onMetadataRequest':
      return 'On the next metadata request';
    case 'manual':
      return 'Only with Regenerate now';
    default:
      return 'When credential types or issuer settings change';
  }
}
