import { describe, expect, it } from 'vitest';
import {
  createFederationTrustAnchorForm,
  federationTrustAnchorCreateBody,
  federationTrustAnchorUpdateBody,
  isFederationEntityId,
} from './federation-trust-anchor-form';

const publicJwks = {
  keys: [{ kty: 'EC', kid: 'federation-1', crv: 'P-256', x: 'x', y: 'y' }],
};

describe('federation trust anchor form', () => {
  it('accepts HTTPS entity IDs only when they have no query or fragment', () => {
    expect(isFederationEntityId('https://anchor.example')).toBe(true);
    expect(isFederationEntityId('http://anchor.example')).toBe(false);
    expect(isFederationEntityId('https://anchor.example?tenant=1')).toBe(false);
    expect(isFederationEntityId('https://anchor.example#anchor')).toBe(false);
  });

  it('requires a valid public JWK set and refuses private key material', () => {
    const form = createFederationTrustAnchorForm();
    form.patchValue({
      id: 'eu-federation',
      entityId: 'https://anchor.example',
      jwks: JSON.stringify({ keys: [] }),
    });
    expect(form.controls.jwks.invalid).toBe(true);

    form.controls.jwks.setValue(
      JSON.stringify({ keys: [{ kty: 'EC', kid: 'key-1', d: 'private' }] })
    );
    expect(form.controls.jwks.invalid).toBe(true);

    form.controls.jwks.setValue(JSON.stringify(publicJwks));
    expect(form.controls.jwks.valid).toBe(true);
  });

  it('trims fields, normalizes an empty description, and omits the ID from updates', () => {
    const form = createFederationTrustAnchorForm();
    form.setValue({
      id: ' eu-federation ',
      entityId: ' https://anchor.example ',
      description: '   ',
      jwks: JSON.stringify(publicJwks),
    });

    expect(federationTrustAnchorCreateBody(form)).toEqual({
      id: 'eu-federation',
      entityId: 'https://anchor.example',
      description: null,
      jwks: publicJwks,
    });
    expect(federationTrustAnchorUpdateBody(form)).toEqual({
      entityId: 'https://anchor.example',
      description: null,
      jwks: publicJwks,
    });
  });
});
