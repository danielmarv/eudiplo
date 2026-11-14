import type { DefaultAccessKeyChainDto, KeyChainResponseDto } from '@eudiplo/sdk-core';

export const KEY_USAGES = [
  {
    value: 'attestation',
    label: 'Credential signing',
    description: 'Sign electronic attestations issued to wallets.',
  },
  {
    value: 'statusList',
    label: 'Status list signing',
    description: 'Sign credential revocation and suspension lists.',
  },
  {
    value: 'access',
    label: 'Wallet access certificate',
    description: 'Authenticate this issuer or verifier to EUDI wallets.',
  },
  {
    value: 'authorizationServer',
    label: 'Authorization server',
    description: 'Sign OAuth access tokens.',
  },
  {
    value: 'trustList',
    label: 'Trust list signing',
    description: 'Sign entries in trust lists.',
  },
  {
    value: 'federation',
    label: 'OpenID Federation entity',
    description: 'Sign this entity’s OpenID Federation configuration.',
  },
] as const;

type KeyUsage = (typeof KEY_USAGES)[number]['value'];
type KeyType = KeyChainResponseDto['type'];
export type KeyUsageCreate = Exclude<KeyUsage, 'encrypt'>;
export type KeyChainTypeSelection = KeyType | 'externalCaChain';
export type CertificateSource = 'selfSigned' | 'registrar' | 'external';
export type ExternalCertificateMode = 'import' | 'csr';

export function usageLabel(usage: string): string {
  return KEY_USAGES.find((item) => item.value === usage)?.label ?? usage;
}

export function defaultAccessChip(
  info: DefaultAccessKeyChainDto | undefined,
  id: string
): { label: string; description: string } | undefined {
  if (info?.keyChainId !== id) return undefined;
  return info.defaultAccessKeyChainId === id
    ? {
        label: 'Default',
        description:
          'Default access key chain. It signs requests and issuer metadata that do not name a key chain.',
      }
    : {
        label: 'Default by rule',
        description: 'No default access key chain is set, so EUDIPLO picks this one by rule.',
      };
}

export function isConfiguredDefaultAccess(
  info: DefaultAccessKeyChainDto | undefined,
  id: string
): boolean {
  return info?.defaultAccessKeyChainId === id;
}

/** Tooltip of the button that sets or removes the key chain as the default. */
export function defaultAccessToggleTooltip(
  info: DefaultAccessKeyChainDto | undefined,
  id: string
): string {
  return isConfiguredDefaultAccess(info, id)
    ? 'Stop using as default access key chain'
    : 'Use as default access key chain';
}

/** Accessible name of that button, naming the key chain and what a press does. */
export function defaultAccessToggleLabel(
  info: DefaultAccessKeyChainDto | undefined,
  id: string,
  name: string
): string {
  return isConfiguredDefaultAccess(info, id)
    ? `Stop using key chain ${name} as default access key chain`
    : `Use key chain ${name} as default access key chain`;
}

export function missingDefaultAccessMessage(
  info: DefaultAccessKeyChainDto | undefined
): string | undefined {
  if (!info?.defaultAccessKeyChainId || info.keyChainId) return undefined;
  return `The default access key chain “${info.defaultAccessKeyChainId}” no longer exists. Requests without their own key chain and signed issuer metadata fail until the default is removed or replaced.`;
}

export function defaultAccessDeleteRefusal(
  info: DefaultAccessKeyChainDto | undefined,
  id: string
): string | undefined {
  return isConfiguredDefaultAccess(info, id)
    ? 'This is the tenant’s default access key chain. Stop using it as default before deleting it.'
    : undefined;
}

export function keyChainDeleteQuestion(key: KeyChainResponseDto): string {
  const name = key.description ? `“${key.description}” (${key.id})` : `“${key.id}”`;
  let consequence =
    'If a configuration names it, deletion is refused and the configuration is named. Configurations that use no explicit key chain may use another key of this usage type or fail if none remains.';
  if (key.usageType === 'federation') {
    consequence +=
      ' If it signs your federation entity configuration, the entity is no longer trusted until your trust anchor lists a replacement public key.';
  } else if (key.usageType === 'authorizationServer') {
    consequence +=
      ' Access tokens it issued are refused after deletion, so issuances in progress can fail.';
  }
  return `Delete key chain ${name}? ${consequence} This cannot be undone.`;
}

export function certificateIsExpired(notAfter: string | undefined, now = Date.now()): boolean {
  return !!notAfter && new Date(notAfter).getTime() < now;
}

export function certificateIsSelfSigned(
  certificate: KeyChainResponseDto['activeCertificate']
): boolean {
  return !!certificate && certificate.subject === certificate.issuer;
}

export function isJwkPublishedKey(key: Pick<KeyChainResponseDto, 'usageType'>): boolean {
  return key.usageType === 'federation' || key.usageType === 'authorizationServer';
}

export function offersCertificateRequest(
  key: Pick<KeyChainResponseDto, 'type' | 'usageType'>
): boolean {
  return key.type === 'standalone' && key.usageType !== 'encrypt' && !isJwkPublishedKey(key);
}

/** The PEM chain in a key import is leaf-first; DER files are normalized before reaching this. */
export function parseCertificateChain(value: string): string[] {
  return value
    .trim()
    .split(/(?=-----BEGIN CERTIFICATE-----)/g)
    .map((certificate) => certificate.trim())
    .filter(Boolean);
}

/** The only key material accepted by the create wizard: EC private JWK or PKCS#8 PEM. */
export function parseExternalPrivateKey(value: string): {
  key?: { kty: string; x: string; y: string; crv: string; d: string };
  keyPem?: string;
} {
  const text = value.trim();
  if (text.includes('-----BEGIN PRIVATE KEY-----')) return { keyPem: text };
  try {
    const key = JSON.parse(text) as Record<string, unknown>;
    if (
      key['kty'] !== 'EC' ||
      typeof key['x'] !== 'string' ||
      typeof key['y'] !== 'string' ||
      typeof key['crv'] !== 'string' ||
      typeof key['d'] !== 'string'
    ) {
      throw new Error();
    }
    return {
      key: {
        kty: key['kty'],
        x: key['x'],
        y: key['y'],
        crv: key['crv'],
        d: key['d'],
      },
    };
  } catch {
    throw new Error('Enter a valid EC private JWK or PKCS#8 PEM key.');
  }
}
