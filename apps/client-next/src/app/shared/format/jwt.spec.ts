import { describe, expect, it } from 'vitest';
import { decodeJwtPart } from './jwt';

const encode = (value: unknown) =>
  btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify(value))))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

describe('decodeJwtPart', () => {
  const header = { alg: 'ES256', typ: 'rc-rp+jwt' };
  const payload = { sub: 'acme', name: 'Ünïcödé Universität', srv: ['?>?'] };
  const jwt = `${encode(header)}.${encode(payload)}.c2lnbmF0dXJl`;

  it('reads the header and the payload, with UTF-8 text and base64url characters', () => {
    expect(decodeJwtPart(jwt, 'header')).toEqual(header);
    expect(decodeJwtPart(jwt, 'payload')).toEqual(payload);
    expect(decodeJwtPart(`  ${jwt}\n`, 'payload')).toEqual(payload);
  });

  it('says what is wrong with a token it cannot read', () => {
    expect(() => decodeJwtPart('abc.def', 'header')).toThrow('three dot-separated parts');
    expect(() => decodeJwtPart(`${encode(header)}.not json!.sig`, 'payload')).toThrow(
      'The payload is not base64url-encoded JSON.'
    );
    expect(() => decodeJwtPart(`${encode(header)}.${encode([1, 2])}.sig`, 'payload')).toThrow(
      'The payload is not a JSON object.'
    );
    expect(() => decodeJwtPart(`${encode('text')}.${encode(payload)}.sig`, 'header')).toThrow(
      'The header is not a JSON object.'
    );
  });
});
