import type { KmsConfigDto } from '@eudiplo/sdk-core';

export type KmsConfigParseResult = { config: KmsConfigDto } | { error: string };

/** Parse and check the shape needed by the tenant KMS configuration endpoint. */
export function parseKmsConfigJson(text: string): KmsConfigParseResult {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return { error: 'Enter valid JSON.' };
  }

  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { error: 'The configuration must be a JSON object.' };
  }

  const config = value as Record<string, unknown>;
  if (!Array.isArray(config['providers'])) {
    return { error: 'The configuration must include a providers array.' };
  }
  if (config['defaultProvider'] !== undefined && typeof config['defaultProvider'] !== 'string') {
    return { error: 'The defaultProvider value must be a string.' };
  }

  return { config: value as KmsConfigDto };
}

export function formatKmsConfig(config: KmsConfigDto | null | undefined): string {
  return JSON.stringify(config ?? { providers: [] }, null, 2);
}
