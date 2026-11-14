import type {
  DefaultAccessKeyChainDto,
  KeyChainResponseDto,
  PresentationConfig,
  PresentationRequest,
} from '@eudiplo/sdk-core';

export type ClientIdScheme = NonNullable<PresentationRequest['clientIdScheme']>;

export const CLIENT_ID_SCHEMES: { value: ClientIdScheme; label: string; hint: string }[] = [
  {
    value: 'x509_hash',
    label: 'Certificate hash',
    hint: 'The wallet identifies the verifier by the hash of its access certificate.',
  },
  {
    value: 'x509_san_dns',
    label: 'Certificate DNS name',
    hint: 'The wallet identifies the verifier by the DNS name in its access certificate.',
  },
  {
    value: 'openid_federation',
    label: 'OpenID Federation entity ID',
    hint: 'Needs a federation key chain, a federation entity ID, a trust anchor and openid_credential_verifier in the federation entity types of the issuer settings.',
  },
];

/** Whether the request can be signed, or why not. */
export type Readiness = { ready: true } | { ready: false; reason: string };

const hasCertificate = (chain: KeyChainResponseDto) => !!chain.activeCertificate?.pem;

/**
 * Whether the access certificate that signs a request of `config` is there: the configuration's
 * own access key chain, else the tenant's default, else any access key chain with a certificate.
 * The backend checks this anyway; this says why before the user tries.
 */
export function accessReadiness(
  config: Pick<PresentationConfig, 'accessKeyChainId'>,
  chains: readonly KeyChainResponseDto[],
  defaults: DefaultAccessKeyChainDto | undefined
): Readiness {
  const access = chains.filter((chain) => chain.usageType === 'access');
  if (!access.length) {
    return {
      ready: false,
      reason:
        'No access key chain is configured. Create an access key chain and its access certificate first.',
    };
  }
  if (config.accessKeyChainId) {
    const chain = access.find((candidate) => candidate.id === config.accessKeyChainId);
    if (!chain) {
      return {
        ready: false,
        reason: `The access key chain ${config.accessKeyChainId} of this configuration does not exist.`,
      };
    }
    return hasCertificate(chain)
      ? { ready: true }
      : {
          ready: false,
          reason: `The access key chain ${chain.id} has no active access certificate. Create or renew it first.`,
        };
  }
  if (defaults?.defaultAccessKeyChainId) {
    const chain = access.find((candidate) => candidate.id === defaults.keyChainId);
    if (!chain) {
      return {
        ready: false,
        reason:
          "The tenant's default access key chain does not exist. Choose another one under Keys.",
      };
    }
    return hasCertificate(chain)
      ? { ready: true }
      : {
          ready: false,
          reason: `The default access key chain ${chain.id} has no active access certificate. Create or renew it first.`,
        };
  }
  return access.some(hasCertificate)
    ? { ready: true }
    : {
        ready: false,
        reason: 'No access key chain has an active access certificate. Create one first.',
      };
}

/**
 * Why a Digital Credentials API request from `origin` would be refused: it names this page's
 * origin, and a configuration with allowed origins accepts only those.
 */
export function originProblem(
  config: Pick<PresentationConfig, 'id' | 'allowedOrigins'> | undefined,
  dcApi: boolean,
  origin: string
): string {
  if (!dcApi || !config?.allowedOrigins?.length || config.allowedOrigins.includes(origin)) {
    return '';
  }
  return `The configuration ${config.id} does not list this page's origin, ${origin}, under its allowed origins for the Digital Credentials API.`;
}

/**
 * Transaction data the user typed to replace the configuration's: a JSON array of objects, each
 * with a `type` and `credential_ids`. Empty text means none. Throws an error that says what is
 * wrong.
 */
export function parseTransactionData(text: string): PresentationRequest['transaction_data'] {
  if (!text.trim()) return undefined;
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch (error) {
    throw new Error(`This is not valid JSON: ${(error as Error).message}`, { cause: error });
  }
  if (!Array.isArray(value)) throw new Error('Enter a JSON array of transaction data entries.');
  value.forEach((entry: unknown, index) => {
    const item = entry as { type?: unknown; credential_ids?: unknown } | null;
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      throw new Error(`Entry ${index + 1} is not an object.`);
    }
    if (typeof item.type !== 'string' || !item.type) {
      throw new Error(`Entry ${index + 1} needs a "type".`);
    }
    if (
      !Array.isArray(item.credential_ids) ||
      !item.credential_ids.length ||
      item.credential_ids.some((id) => typeof id !== 'string')
    ) {
      throw new Error(`Entry ${index + 1} needs "credential_ids", a list of credential query IDs.`);
    }
  });
  return value as PresentationRequest['transaction_data'];
}

/** The credential query IDs a configuration asks for, from its DCQL query. */
export function requestedCredentials(
  config: Pick<PresentationConfig, 'dcql_query'>
): { id: string; format?: string; type?: string; claims: number }[] {
  const credentials = (config.dcql_query as { credentials?: unknown[] } | undefined)?.credentials;
  return (credentials ?? []).map((entry) => {
    const credential = entry as {
      id?: string;
      format?: string;
      meta?: { vct_values?: string[]; doctype_value?: string };
      claims?: unknown[];
    };
    return {
      id: credential.id ?? '',
      format: credential.format,
      type: credential.meta?.vct_values?.[0] ?? credential.meta?.doctype_value,
      claims: credential.claims?.length ?? 0,
    };
  });
}
