import { describe, expect, it } from 'vitest';
import { formatKmsConfig, parseKmsConfigJson } from './kms-config-editor';

describe('KMS configuration editor', () => {
  it('parses valid tenant config without stripping redacted credentials', () => {
    const config = {
      defaultProvider: 'vault',
      providers: [
        { id: 'vault', type: 'vault', vaultUrl: 'https://vault.example', vaultToken: '<redacted>' },
      ],
    };

    expect(parseKmsConfigJson(JSON.stringify(config))).toEqual({ config });
    expect(JSON.parse(formatKmsConfig(config as never))).toEqual(config);
  });

  it.each([
    ['not JSON', 'Enter valid JSON.'],
    ['[]', 'The configuration must be a JSON object.'],
    ['{}', 'The configuration must include a providers array.'],
    ['{"providers":[],"defaultProvider":3}', 'The defaultProvider value must be a string.'],
  ])('rejects invalid input %s', (text, error) => {
    expect(parseKmsConfigJson(text)).toEqual({ error });
  });

  it('starts a new tenant override with an empty provider list', () => {
    expect(formatKmsConfig(null)).toBe('{\n  "providers": []\n}');
  });
});
