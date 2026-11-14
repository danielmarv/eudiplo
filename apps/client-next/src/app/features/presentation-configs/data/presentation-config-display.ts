import type { PresentationConfig } from '@eudiplo/sdk-core';

export type StatusCheckMode = NonNullable<PresentationConfig['statusCheckMode']>;

export const STATUS_CHECK_MODES: { value: StatusCheckMode; label: string; hint: string }[] = [
  {
    value: 'strict',
    label: 'Strict',
    hint: 'Checks the status list of every credential, and refuses it when the list cannot be fetched.',
  },
  {
    value: 'best_effort',
    label: 'Best effort',
    hint: 'Checks the status list, and accepts the credential when the list cannot be fetched.',
  },
  {
    value: 'disabled',
    label: 'Disabled',
    hint: 'Does not check whether a credential was revoked.',
  },
];

/** The configuration's status check mode; strict when unset, as the backend has it. */
export function statusCheckModeOf(
  config: Pick<PresentationConfig, 'statusCheckMode'>
): StatusCheckMode {
  return config.statusCheckMode ?? 'strict';
}

export function statusCheckModeLabel(mode: StatusCheckMode): string {
  return STATUS_CHECK_MODES.find((entry) => entry.value === mode)?.label ?? 'Strict';
}

/** Where a configuration's registration certificate stands. */
export type RegistrationCertStatus = 'none' | 'pending' | 'active' | 'expiring' | 'expired';

interface RegistrationCertCache {
  jwt?: string;
  source?: string;
  issuedAt?: number;
  expiresAt?: number;
}

/** The cached registration certificate, if the backend has resolved one. */
export function registrationCertCache(
  config: Pick<PresentationConfig, 'registrationCertCache'>
): RegistrationCertCache | null {
  return (config.registrationCertCache as RegistrationCertCache | null | undefined) ?? null;
}

const WEEK_SECONDS = 7 * 24 * 3600;

/**
 * None without a registration certificate; pending until the backend resolves it on the next
 * request; expiring in its last week; expired after it.
 */
export function registrationCertStatus(
  config: Pick<PresentationConfig, 'registration_cert' | 'registrationCertCache'>,
  nowSeconds = Math.floor(Date.now() / 1000)
): RegistrationCertStatus {
  const cache = registrationCertCache(config);
  if (!cache) return config.registration_cert ? 'pending' : 'none';
  if (typeof cache.expiresAt === 'number') {
    if (cache.expiresAt < nowSeconds) return 'expired';
    if (cache.expiresAt - nowSeconds < WEEK_SECONDS) return 'expiring';
  }
  return 'active';
}

export const REGISTRATION_STATUS: Record<
  RegistrationCertStatus,
  { label: string; detail: string; tone: string; icon: string }
> = {
  none: {
    label: 'None',
    detail: 'Requests carry no registration certificate.',
    tone: 'bg-muted text-muted-foreground',
    icon: 'lucideMinus',
  },
  pending: {
    label: 'Pending',
    detail: 'Resolved with the next request.',
    tone: 'bg-muted text-foreground',
    icon: 'lucideCircleDashed',
  },
  active: {
    label: 'Active',
    detail: 'Requests carry the registration certificate.',
    tone: 'bg-success/12 text-success',
    icon: 'lucideBadgeCheck',
  },
  expiring: {
    label: 'Expires soon',
    detail: 'Expires within a week. Reissue it.',
    tone: 'bg-warning/12 text-warning',
    icon: 'lucideClock',
  },
  expired: {
    label: 'Expired',
    detail: 'Wallets may refuse requests until it is reissued.',
    tone: 'bg-destructive/10 text-destructive',
    icon: 'lucideCircleX',
  },
};

/** The registration certificate requests carry: the one resolved last, else the imported one. */
export function registrationCertJwt(
  config: Pick<PresentationConfig, 'registration_cert' | 'registrationCertCache'>
): string | undefined {
  return registrationCertCache(config)?.jwt || config.registration_cert?.jwt || undefined;
}

/** How the registration certificate is obtained. */
export function registrationCertSourceLabel(
  config: Pick<PresentationConfig, 'registration_cert'>
): string {
  const cert = config.registration_cert;
  if (!cert) return 'None';
  if (cert.jwt) return 'Imported JWT';
  if (cert.id) return `Registrar certificate ${cert.id}`;
  return 'Requested from the registrar';
}

/** Languages offered for the purpose a wallet shows. */
export const PURPOSE_LANGUAGES: { value: string; label: string }[] = [
  { value: 'en-US', label: 'English (US)' },
  { value: 'en-GB', label: 'English (UK)' },
  { value: 'de-DE', label: 'German' },
  { value: 'fr-FR', label: 'French' },
  { value: 'it-IT', label: 'Italian' },
  { value: 'es-ES', label: 'Spanish' },
  { value: 'nl-NL', label: 'Dutch' },
  { value: 'pt-PT', label: 'Portuguese' },
  { value: 'pl-PL', label: 'Polish' },
  { value: 'cs-CZ', label: 'Czech' },
  { value: 'sk-SK', label: 'Slovak' },
  { value: 'sl-SI', label: 'Slovenian' },
  { value: 'hr-HR', label: 'Croatian' },
  { value: 'hu-HU', label: 'Hungarian' },
  { value: 'ro-RO', label: 'Romanian' },
  { value: 'bg-BG', label: 'Bulgarian' },
  { value: 'el-GR', label: 'Greek' },
  { value: 'fi-FI', label: 'Finnish' },
  { value: 'sv-SE', label: 'Swedish' },
  { value: 'da-DK', label: 'Danish' },
  { value: 'et-EE', label: 'Estonian' },
  { value: 'lv-LV', label: 'Latvian' },
  { value: 'lt-LT', label: 'Lithuanian' },
  { value: 'mt-MT', label: 'Maltese' },
  { value: 'ga-IE', label: 'Irish' },
];
