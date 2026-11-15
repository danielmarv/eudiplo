import {
  type AbstractControl,
  FormArray,
  FormControl,
  FormGroup,
  type ValidationErrors,
  Validators,
} from '@angular/forms';
import type { IssuanceConfig, UpdateIssuanceDto } from '@eudiplo/sdk-core';
import {
  certificateBase64,
  certificateValidator,
} from '../../../shared/certificates/certificate-validator';
import { uniqueDisplayLocaleValidator } from '../../../shared/display/display-entries';

/**
 * The form of the issuer settings and its conversions: the stored settings fill it, and it builds
 * the body `POST /api/issuer/config` takes. Settings of the federation block the form does not edit
 * (entity types, authority hints, trust marks…) are carried over unchanged.
 */

export type ServerType = 'built-in' | 'oid4vp' | 'chained' | 'external';
export type StatusCheck = 'strict' | 'best_effort' | 'disabled';
type Rec = Record<string, unknown>;

export const SERVER_TYPES: { value: ServerType; label: string; hint: string }[] = [
  {
    value: 'built-in',
    label: 'Built-in',
    hint: 'EUDIPLO authorizes offers itself, with pre-authorized codes.',
  },
  {
    value: 'oid4vp',
    label: 'Hosted presentation',
    hint: 'The user presents a credential to get the new one.',
  },
  {
    value: 'chained',
    label: 'Upstream login',
    hint: 'The user signs in at an OpenID Connect provider.',
  },
  { value: 'external', label: 'External', hint: 'Another authorization server issues the tokens.' },
];

const RESERVED_SERVER_IDS = ['built-in', 'chained-as'];

/** The access token lifetime a server has without one: the built-in server issues short ones. */
export function defaultTokenLifetime(type: string | undefined): number {
  return type === 'built-in' ? 300 : 3600;
}

const rec = (value: unknown): Rec => (value && typeof value === 'object' ? (value as Rec) : {});
const str = (value: unknown): string => (typeof value === 'string' ? value : '');

// ---- Trust lists ----

/**
 * One wallet provider trust list: a list of this tenant (`managed`), or an external one by URL and
 * the X.509 certificate that signs it. A public key stored on an older entry is carried along
 * until a certificate replaces it.
 */
export function createTrustListGroup(entry?: Rec, mode?: 'managed' | 'external') {
  let legacyKey: Rec | null = null;
  const key = entry?.['verifierKey'];
  if (key && typeof key === 'object') legacyKey = key as Rec;
  else if (typeof key === 'string' && key.trim()) {
    try {
      legacyKey = JSON.parse(key) as Rec;
    } catch {
      legacyKey = null;
    }
  }
  const der = str(entry?.['verifierX509Der']);
  return new FormGroup(
    {
      mode: new FormControl<'managed' | 'external'>(
        mode ?? (str(entry?.['trustListId']).trim() ? 'managed' : 'external'),
        { nonNullable: true }
      ),
      trustListId: new FormControl(str(entry?.['trustListId']), { nonNullable: true }),
      url: new FormControl(str(entry?.['url']), { nonNullable: true }),
      certificate: new FormControl(der, { nonNullable: true, validators: certificateValidator }),
      legacyKey: new FormControl<Rec | null>(legacyKey),
      legacyPem: new FormControl<string | null>(str(entry?.['verifierKeyPem']).trim() || null),
      storedDer: new FormControl<string | null>(der || null),
    },
    { validators: trustListValidator }
  );
}
export type TrustListGroup = ReturnType<typeof createTrustListGroup>;

function trustListValidator(control: AbstractControl): ValidationErrors | null {
  const value = control.value as ReturnType<TrustListGroup['getRawValue']>;
  if (value.mode === 'managed')
    return value.trustListId?.trim() ? null : { missingTrustList: true };
  if (!value.url?.trim()) return { missingUrl: true };
  if (value.certificate?.trim()) return null;
  return value.legacyKey || value.legacyPem ? null : { missingVerifier: true };
}

/** The entered certificate as base64 DER when it differs from the stored one; else undefined. */
function newCertificate(entered: string, stored: string | null): string | undefined {
  const certificate = entered.trim() ? certificateBase64(entered) : undefined;
  const previous = stored ? certificateBase64(stored) : undefined;
  return certificate !== previous ? certificate : undefined;
}

/** Names the public key a stored entry pins ("JWK", "PEM"), unless a new certificate replaces it. */
export function pinnedKey(entry: TrustListGroup): string | null {
  const value = entry.getRawValue();
  const kinds = [value.legacyKey && 'JWK', value.legacyPem && 'PEM'].filter(Boolean);
  if (!kinds.length || newCertificate(value.certificate, value.storedDer)) return null;
  return kinds.join(' and ');
}

function trustListsBody(entries: ReturnType<TrustListGroup['getRawValue']>[]): Rec[] {
  return entries
    .map((entry): Rec => {
      if (entry.mode === 'managed' && entry.trustListId.trim()) {
        return { trustListId: entry.trustListId.trim() };
      }
      const url = entry.url.trim() || undefined;
      const certificate = entry.certificate.trim()
        ? certificateBase64(entry.certificate)
        : undefined;
      if (newCertificate(entry.certificate, entry.storedDer))
        return { url, verifierX509Der: certificate };
      return {
        url,
        ...(entry.legacyKey ? { verifierKey: entry.legacyKey } : {}),
        ...(entry.legacyPem?.trim() ? { verifierKeyPem: entry.legacyPem.trim() } : {}),
        ...(certificate ? { verifierX509Der: certificate } : {}),
      };
    })
    .filter((entry) => !!entry['trustListId'] || !!entry['url']);
}

const trustListArray = (entries: unknown) =>
  new FormArray<TrustListGroup>(
    (Array.isArray(entries) ? entries : []).map((entry) =>
      createTrustListGroup(typeof entry === 'string' ? { url: entry } : rec(entry))
    )
  );

// ---- Authorization servers ----

/** One authorization server; one shape for every type, so the type can change in place. */
export function createServerGroup(server?: Rec) {
  const type = (str(server?.['type']) || 'oid4vp') as ServerType;
  const token = rec(server?.['token']);
  const upstream = rec(server?.['upstream']);
  const oid4vp = rec(server?.['oid4vp']);
  const attestation = server?.['walletAttestationRequired'];
  const lists = server?.['walletProviderTrustLists'];
  const group = new FormGroup({
    type: new FormControl<ServerType>(type, { nonNullable: true }),
    id: new FormControl(str(server?.['id']) || (type === 'built-in' ? 'issuer-built-in' : ''), {
      nonNullable: true,
      validators: Validators.required,
    }),
    label: new FormControl(str(server?.['label']), { nonNullable: true }),
    issuer: new FormControl(str(server?.['issuer']), { nonNullable: true }),
    enabled: new FormControl(server?.['enabled'] !== false, { nonNullable: true }),
    requireDPoP: new FormControl(!!server?.['requireDPoP'], { nonNullable: true }),
    walletAttestation: new FormControl<'inherit' | 'required' | 'optional'>(
      attestation === true ? 'required' : attestation === false ? 'optional' : 'inherit',
      { nonNullable: true }
    ),
    statusCheck: new FormControl<StatusCheck | 'inherit'>(
      (str(server?.['walletAttestationStatusCheckMode']) as StatusCheck) || 'inherit',
      { nonNullable: true }
    ),
    inheritTrustLists: new FormControl(
      (server?.['inheritWalletProviderTrustLists'] as boolean | undefined) ?? lists == null,
      { nonNullable: true }
    ),
    trustLists: trustListArray(lists),
    presentationConfigId: new FormControl(
      str(server?.['presentationConfigId']) || str(oid4vp['presentationConfigId']),
      { nonNullable: true }
    ),
    immediateWalletRedirect: new FormControl(
      (server?.['immediateWalletRedirect'] as boolean | undefined) ??
        (oid4vp['immediateWalletRedirect'] as boolean | undefined) ??
        true,
      { nonNullable: true }
    ),
    upstreamIssuer: new FormControl(str(upstream['issuer']), { nonNullable: true }),
    clientId: new FormControl(str(upstream['clientId']), { nonNullable: true }),
    clientSecret: new FormControl(str(upstream['clientSecret']), { nonNullable: true }),
    scopes: new FormControl(
      (Array.isArray(upstream['scopes'])
        ? (upstream['scopes'] as string[])
        : ['openid', 'profile', 'email']
      ).join(' '),
      { nonNullable: true }
    ),
    tokenLifetime: new FormControl(
      (token['lifetimeSeconds'] as number | undefined) ?? defaultTokenLifetime(type),
      { nonNullable: true, validators: Validators.min(60) }
    ),
    signingKeyId: new FormControl(str(token['signingKeyId']), { nonNullable: true }),
    refreshTokens: new FormControl((token['refreshTokenEnabled'] as boolean | undefined) ?? true, {
      nonNullable: true,
    }),
    refreshLifetime: new FormControl(
      (token['refreshTokenExpiresInSeconds'] as number | undefined) ?? 2592000,
      { nonNullable: true, validators: Validators.min(1) }
    ),
  });
  const syncLists = () => {
    if (group.controls.inheritTrustLists.value)
      group.controls.trustLists.disable({ emitEvent: false });
    else group.controls.trustLists.enable({ emitEvent: false });
  };
  syncLists();
  group.controls.inheritTrustLists.valueChanges.subscribe(syncLists);
  return group;
}
export type ServerGroup = ReturnType<typeof createServerGroup>;

function serverBody(server: ReturnType<ServerGroup['getRawValue']>): Rec | null {
  const id = server.id.trim();
  if (!id) return null;
  if (server.type === 'external') {
    const issuer = server.issuer.trim();
    return issuer ? { id, type: 'external', issuer, label: server.label.trim() || issuer } : null;
  }
  const token = {
    lifetimeSeconds: Number(server.tokenLifetime) || defaultTokenLifetime(server.type),
    ...(server.signingKeyId ? { signingKeyId: server.signingKeyId } : {}),
    refreshTokenEnabled: server.refreshTokens,
    ...(server.refreshTokens
      ? { refreshTokenExpiresInSeconds: Number(server.refreshLifetime) || 2592000 }
      : {}),
  };
  const base: Rec = {
    id,
    type: server.type,
    label:
      server.label.trim() || (server.type === 'built-in' ? 'Built-in Authorization Server' : id),
    enabled: server.enabled,
    requireDPoP: server.requireDPoP,
    ...(server.walletAttestation !== 'inherit'
      ? { walletAttestationRequired: server.walletAttestation === 'required' }
      : {}),
    ...(server.statusCheck !== 'inherit'
      ? { walletAttestationStatusCheckMode: server.statusCheck }
      : {}),
    ...(server.inheritTrustLists
      ? {}
      : { walletProviderTrustLists: trustListsBody(server.trustLists) }),
    token,
  };
  if (server.type === 'chained') {
    return {
      ...base,
      upstream: {
        issuer: server.upstreamIssuer.trim(),
        clientId: server.clientId.trim(),
        // Shown as <redacted> when stored, which keeps it; empty means a public client.
        ...(server.clientSecret ? { clientSecret: server.clientSecret } : {}),
        scopes: server.scopes.split(/[\s,]+/).filter(Boolean),
      },
    };
  }
  if (server.type === 'oid4vp') {
    return {
      ...base,
      presentationConfigId: server.presentationConfigId,
      immediateWalletRedirect: server.immediateWalletRedirect,
    };
  }
  return base;
}

// ---- The form ----

export function createDisplayGroup(display?: Rec) {
  return new FormGroup({
    name: new FormControl(str(display?.['name']), {
      nonNullable: true,
      validators: Validators.required,
    }),
    locale: new FormControl(str(display?.['locale']) || 'en-US', {
      nonNullable: true,
      validators: [Validators.required, uniqueDisplayLocaleValidator],
    }),
    logo: new FormControl(str(rec(display?.['logo'])['uri']), { nonNullable: true }),
  });
}
export type DisplayGroup = ReturnType<typeof createDisplayGroup>;

export function createTrustAnchorGroup(anchor?: Rec) {
  return new FormGroup({
    entityId: new FormControl(str(anchor?.['entityId']), {
      nonNullable: true,
      validators: Validators.required,
    }),
    entityConfigurationUri: new FormControl(str(anchor?.['entityConfigurationUri']), {
      nonNullable: true,
      validators: Validators.required,
    }),
  });
}
export type TrustAnchorGroup = ReturnType<typeof createTrustAnchorGroup>;

export function createIssuerSettingsForm() {
  const form = new FormGroup({
    displays: new FormArray<DisplayGroup>([]),
    servers: new FormArray<ServerGroup>([]),
    batchSize: new FormControl(1, {
      nonNullable: true,
      validators: [Validators.required, Validators.min(1)],
    }),
    dPopRequired: new FormControl(false, { nonNullable: true }),
    credentialResponseEncryption: new FormControl(false, { nonNullable: true }),
    credentialRequestEncryption: new FormControl(false, { nonNullable: true }),
    notificationEndpointEnabled: new FormControl(true, { nonNullable: true }),
    txCodeMaxAttempts: new FormControl<number | null>(null, Validators.min(1)),
    walletAttestationRequired: new FormControl(false, { nonNullable: true }),
    statusCheck: new FormControl<StatusCheck | ''>('', { nonNullable: true }),
    trustLists: new FormArray<TrustListGroup>([]),
    federation: new FormGroup({
      enabled: new FormControl(false, { nonNullable: true }),
      mode: new FormControl<'hybrid' | 'federation-only'>('hybrid', { nonNullable: true }),
      // The editor pattern of the backend issuance schema; the backend checks the rest.
      entityId: new FormControl('', {
        nonNullable: true,
        validators: Validators.pattern(/^https?:\/\/[^\s?#]+$/),
      }),
      cacheTtlSeconds: new FormControl(300, { nonNullable: true, validators: Validators.min(0) }),
      trustAnchors: new FormArray<TrustAnchorGroup>([]),
    }),
    registration: new FormGroup({
      enabled: new FormControl(false, { nonNullable: true }),
      mode: new FormControl<'generate' | 'import'>('generate', { nonNullable: true }),
      jwt: new FormControl('', { nonNullable: true }),
      privacyPolicy: new FormControl('', { nonNullable: true }),
      supportUri: new FormControl('', { nonNullable: true }),
      renewal: new FormControl<'onCredentialConfigChange' | 'onMetadataRequest' | 'manual'>(
        'onCredentialConfigChange',
        { nonNullable: true }
      ),
    }),
  });
  // Hidden federation fields must not block saving.
  const federation = form.controls.federation.controls;
  const syncFederation = () => {
    for (const control of [federation.trustAnchors, federation.entityId]) {
      if (federation.enabled.value) control.enable({ emitEvent: false });
      else control.disable({ emitEvent: false });
    }
  };
  syncFederation();
  federation.enabled.valueChanges.subscribe(syncFederation);
  return form;
}
export type IssuerSettingsForm = ReturnType<typeof createIssuerSettingsForm>;

/** The keys of the federation block the form edits; the others are carried over. */
const EDITED_FEDERATION_KEYS = new Set([
  'role',
  'mode',
  'entityId',
  'enforceSigningPolicy',
  'cacheTtlSeconds',
  'trustAnchors',
]);

/**
 * Fills the form with stored settings. Returns the federation settings the form does not edit,
 * which `issuerSettingsBody` sends back unchanged.
 */
export function fillIssuerSettingsForm(
  form: IssuerSettingsForm,
  config: IssuanceConfig | Rec
): Rec {
  const raw = config as Rec;
  const c = form.controls;
  c.displays.clear({ emitEvent: false });
  for (const display of Array.isArray(raw['display']) ? raw['display'] : []) {
    c.displays.push(createDisplayGroup(rec(display)), { emitEvent: false });
  }
  c.servers.clear({ emitEvent: false });
  for (const server of Array.isArray(raw['authorizationServers'])
    ? raw['authorizationServers']
    : []) {
    if (['built-in', 'oid4vp', 'chained', 'external'].includes(str(rec(server)['type']))) {
      c.servers.push(createServerGroup(rec(server)), { emitEvent: false });
    }
  }
  form.setControl('trustLists', trustListArray(raw['walletProviderTrustLists']), {
    emitEvent: false,
  });
  const registration = rec(raw['registrationCertificate']);
  form.patchValue(
    {
      batchSize: (raw['batchSize'] as number | undefined) ?? 1,
      dPopRequired: !!raw['dPopRequired'],
      credentialResponseEncryption: !!raw['credentialResponseEncryption'],
      credentialRequestEncryption: !!raw['credentialRequestEncryption'],
      notificationEndpointEnabled: raw['notificationEndpointEnabled'] !== false,
      walletAttestationRequired: !!raw['walletAttestationRequired'],
      statusCheck: (str(raw['walletAttestationStatusCheckMode']) as StatusCheck) || '',
      txCodeMaxAttempts: (raw['txCodeMaxAttempts'] as number | null | undefined) ?? null,
      registration: {
        enabled: !!registration['enabled'],
        mode: registration['mode'] === 'import' ? 'import' : 'generate',
        jwt: str(registration['jwt']),
        privacyPolicy: str(registration['privacyPolicy']),
        supportUri: str(registration['supportUri']),
        renewal:
          (str(registration['renewal']) as 'onMetadataRequest' | 'manual') ||
          'onCredentialConfigChange',
      },
    },
    { emitEvent: false }
  );

  const federation = rec(raw['federation']);
  const anchors = Array.isArray(federation['trustAnchors'])
    ? (federation['trustAnchors'] as Rec[])
    : [];
  c.federation.controls.trustAnchors.clear({ emitEvent: false });
  for (const anchor of anchors) {
    c.federation.controls.trustAnchors.push(createTrustAnchorGroup(anchor), { emitEvent: false });
  }
  c.federation.patchValue({
    enabled: anchors.length > 0,
    mode: federation['mode'] === 'federation-only' ? 'federation-only' : 'hybrid',
    entityId: str(federation['entityId']),
    cacheTtlSeconds: (federation['cacheTtlSeconds'] as number | undefined) ?? 300,
  });
  for (const display of c.displays.controls) display.controls.locale.updateValueAndValidity();
  form.updateValueAndValidity();
  return Object.fromEntries(
    Object.entries(federation).filter(([key]) => !EDITED_FEDERATION_KEYS.has(key))
  );
}

/** The body of the form for `POST /api/issuer/config`. */
export function issuerSettingsBody(
  form: IssuerSettingsForm,
  carriedFederation: Rec
): UpdateIssuanceDto {
  const raw = form.getRawValue();
  const federation = raw.federation;
  const registration = raw.registration;
  return {
    batchSize: Number(raw.batchSize),
    display: raw.displays.map((display) => ({
      name: display.name.trim(),
      locale: display.locale,
      ...(display.logo.trim() ? { logo: { uri: display.logo.trim() } } : {}),
    })),
    dPopRequired: raw.dPopRequired,
    credentialResponseEncryption: raw.credentialResponseEncryption,
    credentialRequestEncryption: raw.credentialRequestEncryption,
    notificationEndpointEnabled: raw.notificationEndpointEnabled,
    txCodeMaxAttempts: raw.txCodeMaxAttempts ?? null,
    authorizationServers: raw.servers.map(serverBody).filter((server): server is Rec => !!server),
    walletAttestationRequired: raw.walletAttestationRequired,
    walletAttestationStatusCheckMode: raw.statusCheck || null,
    walletProviderTrustLists: trustListsBody(raw.trustLists),
    federation:
      federation.enabled && federation.trustAnchors.length
        ? {
            ...carriedFederation,
            mode: federation.mode,
            ...(federation.entityId.trim() ? { entityId: federation.entityId.trim() } : {}),
            cacheTtlSeconds: Number(federation.cacheTtlSeconds) || 300,
            trustAnchors: federation.trustAnchors,
          }
        : null,
    registrationCertificate: !registration.enabled
      ? null
      : registration.mode === 'import'
        ? {
            enabled: true,
            mode: 'import',
            ...(registration.jwt.trim() ? { jwt: registration.jwt.trim() } : {}),
          }
        : {
            enabled: true,
            mode: 'generate',
            ...(registration.privacyPolicy.trim()
              ? { privacyPolicy: registration.privacyPolicy.trim() }
              : {}),
            ...(registration.supportUri.trim()
              ? { supportUri: registration.supportUri.trim() }
              : {}),
            // The default is left out, so stored and exported settings carry only a choice.
            ...(registration.renewal !== 'onCredentialConfigChange'
              ? { renewal: registration.renewal }
              : {}),
          },
  } as unknown as UpdateIssuanceDto;
}

/** Problems of the authorization servers the backend would refuse, in words; empty when none. */
export function serverProblems(form: IssuerSettingsForm): string {
  const servers = form.controls.servers.getRawValue();
  const ids = servers.map((server) => server.id.trim());
  if (!servers.some((server) => server.type === 'external' || server.enabled)) {
    return 'Add at least one enabled authorization server.';
  }
  if (ids.some((id) => !id)) return 'Enter an ID for every authorization server.';
  if (ids.some((id) => RESERVED_SERVER_IDS.includes(id))) {
    return 'The IDs built-in and chained-as are reserved. Choose another server ID.';
  }
  if (new Set(ids).size !== ids.length) return 'Every authorization server needs its own ID.';
  if (servers.filter((server) => server.type === 'built-in').length > 1) {
    return 'Only one built-in authorization server can be set up.';
  }
  for (const server of servers) {
    if (server.type === 'external' && !server.issuer.trim()) {
      return 'Enter the URL of each external authorization server.';
    }
    if (!server.enabled) continue;
    if (server.type === 'oid4vp' && !server.presentationConfigId) {
      return 'Choose a presentation configuration for each hosted presentation.';
    }
    if (server.type === 'chained' && (!server.upstreamIssuer.trim() || !server.clientId.trim())) {
      return 'Enter the provider URL and client ID of each upstream login.';
    }
  }
  return '';
}

/** The entity configuration URI of an entity ID, where OpenID Federation serves it. */
export function entityConfigurationUri(entityId: string): string {
  return `${entityId.replace(/\/+$/, '')}/.well-known/openid-federation`;
}
